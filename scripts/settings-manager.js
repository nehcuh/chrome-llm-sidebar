class SettingsManager {
    constructor(mcpService, mcpConfigManager) {
        this.config = {
            apiUrl: 'https://api.openai.com/v1',
            apiKey: '',
            temperature: 0.7,
            model: 'gpt-3.5-turbo',
            mcpEnabled: false
        };
        this.mcpService = mcpService; // Use the provided instance
        this.mcpConfigManager = mcpConfigManager; // Use the provided instance
    }

    async init() {
        await this.loadConfig();
    }

    async loadConfig() {
        try {
            const stored = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'temperature', 'model', 'mcpEnabled']);
            this.config = { ...this.config, ...stored };
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    async saveSettings() {
        const newConfig = {
            apiUrl: document.getElementById('apiUrl').value.trim(),
            apiKey: document.getElementById('apiKey').value.trim(),
            temperature: parseFloat(document.getElementById('temperature').value),
            model: document.getElementById('model').value.trim(),
            mcpEnabled: document.getElementById('mcpEnabled')?.checked || false
        };

        const newBridgeUrl = document.getElementById('bridgeUrl')?.value.trim() || '';

        if (!newConfig.apiUrl || !newConfig.apiKey) {
            alert('请填写API URL和API Key');
            return;
        }

        try {
            await chrome.storage.sync.set(newConfig);
            this.config = { ...this.config, ...newConfig };
            window.chatService.config = this.config; // Update shared config

            // Only handle MCP if enabled
            if (newConfig.mcpEnabled) {
                if (newBridgeUrl !== this.mcpService.bridgeUrl) {
                    this.mcpService.bridgeUrl = newBridgeUrl;
                    await chrome.storage.sync.set({ mcpBridgeUrl: newBridgeUrl });
                    await this.mcpService.checkBridgeConnection();
                }
            } else {
                // Disable MCP if turned off
                this.mcpService.bridgeConnected = false;
                this.mcpService.availableTools.clear();
            }
            
            alert('设置已保存');
            return true;
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('保存设置失败');
            return false;
        }
    }

    async resetSettings() {
        if (confirm('确定要重置所有设置吗？')) {
            try {
                await chrome.storage.sync.clear();
                await chrome.storage.local.clear(); // Also clear local storage for history etc.
                this.config = {
                    apiUrl: 'https://api.openai.com/v1',
                    apiKey: '',
                    temperature: 0.7,
                    model: 'gpt-3.5-turbo',
                    mcpEnabled: false
                };
                window.chatService.config = this.config;
                // Disable MCP on reset
                this.mcpService.bridgeConnected = false;
                this.mcpService.availableTools.clear();
                alert('设置已重置');
                return true;
            } catch (error) {
                console.error('Failed to reset settings:', error);
                alert('重置设置失败');
                return false;
            }
        }
        return false;
    }

    async getSelectedMCPServices() {
        try {
            const stored = await chrome.storage.local.get(['selectedMCPServices']);
            return stored.selectedMCPServices || [];
        } catch (error) {
            console.error('Failed to get selected MCP services:', error);
            return [];
        }
    }
}