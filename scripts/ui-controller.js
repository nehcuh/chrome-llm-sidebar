class UIController {
    constructor(chatService, settingsManager) {
        this.chatService = chatService;
        this.settingsManager = settingsManager;
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.updateSettingsUI();
        this.renderMessages();
        await this.refreshMCPServiceList();
        this.handleInputChange();
    }

    getElements() {
        // It's often better to get elements when needed, but for simplicity:
        return {
            messageInput: document.getElementById('messageInput'),
            sendBtn: document.getElementById('sendBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            closeSettings: document.getElementById('closeSettings'),
            settingsPanel: document.getElementById('settingsPanel'),
            clearBtn: document.getElementById('clearBtn'),
            saveSettings: document.getElementById('saveSettings'),
            resetSettings: document.getElementById('resetSettings'),
            testBridgeConnection: document.getElementById('testBridgeConnection'),
            mcpToolsEnabled: document.getElementById('mcpToolsEnabled'),
            selectAllMCP: document.getElementById('selectAllMCP'),
            clearAllMCP: document.getElementById('clearAllMCP'),
            refreshMCP: document.getElementById('refreshMCP'),
            validateMCPConfig: document.getElementById('validateMCPConfig'),
            importMCPConfig: document.getElementById('importMCPConfig'),
            exportMCPConfig: document.getElementById('exportMCPConfig'),
        };
    }

    setupEventListeners() {
        const elements = this.getElements();

        elements.messageInput.addEventListener('input', () => this.handleInputChange());
        elements.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        elements.sendBtn.addEventListener('click', () => this.sendMessage());
        elements.clearBtn.addEventListener('click', async () => {
            if (confirm('确定要清除所有对话吗？')) {
                await this.chatService.clearMessages();
                this.renderMessages();
            }
        });

        elements.settingsBtn.addEventListener('click', () => this.showSettings());
        elements.closeSettings.addEventListener('click', () => this.hideSettings());

        elements.saveSettings.addEventListener('click', async () => {
            const success = await this.settingsManager.saveSettings();
            if (success) {
                this.updateSettingsUI();
                this.hideSettings();
                this.handleInputChange();
            }
        });

        elements.resetSettings.addEventListener('click', async () => {
            const success = await this.settingsManager.resetSettings();
            if (success) {
                this.updateSettingsUI();
                window.location.reload();
            }
        });
        
        elements.testBridgeConnection.addEventListener('click', () => this.testBridgeConnection());
        
        elements.mcpToolsEnabled.addEventListener('change', (e) => {
            this.toggleMCPServiceSelector(e.target.checked);
        });
        elements.selectAllMCP.addEventListener('click', () => this.selectAllMCPServices());
        elements.clearAllMCP.addEventListener('click', () => this.clearAllMCPServices());
        elements.refreshMCP.addEventListener('click', () => this.refreshMCPServiceList());

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchMCPTab(e.target.dataset.tab);
            });
        });

        elements.validateMCPConfig.addEventListener('click', () => this.validateMCPConfig());
        elements.importMCPConfig.addEventListener('click', () => this.importMCPConfig());
        elements.exportMCPConfig.addEventListener('click', () => this.exportMCPConfig());
    }

    async testBridgeConnection() {
        const button = document.getElementById('testBridgeConnection');
        const originalText = button.textContent;
        button.textContent = '测试中...';
        button.disabled = true;

        try {
            const success = await this.settingsManager.mcpService.checkBridgeConnection();
            alert(success ? '桥接服务器连接成功！' : '连接失败，请检查服务器是否运行或URL是否正确。');
            this.updateBridgeStatus(success);
        } catch (error) {
            alert(`连接出错: ${error.message}`);
            this.updateBridgeStatus(false);
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    updateBridgeStatus(connected) {
        const indicator = document.getElementById('bridgeStatusIndicator');
        const text = document.getElementById('bridgeStatusText');
        if(indicator && text) {
            indicator.className = 'status-indicator ' + (connected ? 'connected' : '');
            text.textContent = connected ? '已连接' : '未连接';
        }
    }

    sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        if (!message) return;

        const webSearchEnabled = document.getElementById('webSearchEnabled').checked;
        const mcpToolsEnabled = document.getElementById('mcpToolsEnabled').checked;

        this.chatService.sendMessage(message, webSearchEnabled, mcpToolsEnabled, () => this.settingsManager.getSelectedMCPServices());
        
        messageInput.value = '';
        this.handleInputChange();
    }

    handleInputChange() {
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const hasText = messageInput.value.trim().length > 0;
        const hasConfig = this.settingsManager.config.apiKey;
        sendBtn.disabled = !hasText || !hasConfig;
    }

    renderMessages() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        this.chatService.messages.forEach(message => this.renderMessage(message));
        this.scrollToBottom();
    }

    renderMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}`;
        messageElement.setAttribute('data-message-id', message.id);

        let content = message.content;
        const escapeHtml = (unsafe) => unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        content = escapeHtml(content);
        content = content.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');

        messageElement.innerHTML = content;
        chatMessages.appendChild(messageElement);
        this.scrollToBottom();
    }
    
    removeMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    updateSettingsUI() {
        const config = this.settingsManager.config;
        document.getElementById('apiUrl').value = config.apiUrl;
        document.getElementById('apiKey').value = config.apiKey;
        document.getElementById('temperature').value = config.temperature;
        document.getElementById('temperatureValue').textContent = config.temperature;
        document.getElementById('model').value = config.model;
        document.getElementById('bridgeUrl').value = this.settingsManager.mcpService.bridgeUrl;
        this.updateBridgeStatus(this.settingsManager.mcpService.bridgeConnected);
    }

    showSettings() {
        document.getElementById('settingsPanel').classList.add('is-visible');
        this.renderMCPServers();
    }

    hideSettings() {
        document.getElementById('settingsPanel').classList.remove('is-visible');
    }

    async toggleMCPServiceSelector(enabled) {
        document.getElementById('mcpServiceSelector').style.display = enabled ? 'block' : 'none';
        if (enabled) {
            await this.refreshMCPServiceList();
        }
    }

    async refreshMCPServiceList() {
        const container = document.getElementById('mcpServiceList');
        const servers = this.settingsManager.mcpService.getAllServers();
        const selectedServices = await this.settingsManager.getSelectedMCPServices();

        container.innerHTML = servers.map(server => `
            <div class="mcp-service-item-simple">
                <label>
                    <input type="checkbox" class="mcp-service-checkbox" data-service-name="${server.name}" ${selectedServices.includes(server.name) ? 'checked' : ''}>
                    ${server.name}
                </label>
            </div>
        `).join('');

        container.querySelectorAll('.mcp-service-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', () => this.updateMCPServiceSelection());
        });
    }

    async updateMCPServiceSelection() {
        const selectedServices = [];
        document.querySelectorAll('.mcp-service-checkbox:checked').forEach(checkbox => {
            selectedServices.push(checkbox.dataset.serviceName);
        });
        await chrome.storage.local.set({ selectedMCPServices: selectedServices });
    }

    selectAllMCPServices() {
        document.querySelectorAll('.mcp-service-checkbox').forEach(checkbox => checkbox.checked = true);
        this.updateMCPServiceSelection();
    }

    clearAllMCPServices() {
        document.querySelectorAll('.mcp-service-checkbox').forEach(checkbox => checkbox.checked = false);
        this.updateMCPServiceSelection();
    }

    switchMCPTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.tab-btn[data-tab="${tabName}"]`).classList.add('active');

        const visualPanel = document.getElementById('mcpVisualPanel');
        const jsonPanel = document.getElementById('mcpJsonPanel');

        if (tabName === 'json') {
            visualPanel.classList.add('hidden');
            jsonPanel.classList.remove('hidden');
            this.loadCurrentConfigToJson();
        } else {
            visualPanel.classList.remove('hidden');
            jsonPanel.classList.add('hidden');
            this.renderMCPServers();
        }
    }

    loadCurrentConfigToJson() {
        const jsonTextarea = document.getElementById('mcpJsonConfig');
        if (!jsonTextarea.value.trim()) {
            jsonTextarea.value = this.settingsManager.mcpConfigManager.exportCurrentConfig(this.settingsManager.mcpService);
        }
    }

    validateMCPConfig() {
        const configText = document.getElementById('mcpJsonConfig').value;
        const result = this.settingsManager.mcpConfigManager.validateConfig(configText);
        const formatted = this.settingsManager.mcpConfigManager.formatValidationResult(result);
        this.showValidationResult(formatted.type, formatted.message);
        return result;
    }

    async importMCPConfig() {
        const validationResult = this.validateMCPConfig();
        if (!validationResult.valid) return;

        if (confirm('导入配置将替换现有的MCP服务器设置，确认继续？')) {
            const importResult = this.settingsManager.mcpConfigManager.importConfig(validationResult, this.settingsManager.mcpService);
            if (importResult.success) {
                await this.settingsManager.mcpService.saveMCPConfig();
                this.renderMCPServers();
                this.switchMCPTab('visual');
                alert(importResult.message);
            } else {
                alert(importResult.error);
            }
        }
    }

    exportMCPConfig() {
        const config = this.settingsManager.mcpConfigManager.exportCurrentConfig(this.settingsManager.mcpService);
        navigator.clipboard.writeText(config).then(() => {
            alert('配置已复制到剪贴板');
        }).catch(() => {
            document.getElementById('mcpJsonConfig').value = config;
            this.switchMCPTab('json');
            alert('配置已加载到JSON编辑器');
        });
    }

    showValidationResult(type, message) {
        const resultDiv = document.getElementById('configValidationResult');
        resultDiv.className = `validation-result ${type}`;
        resultDiv.textContent = message;
        resultDiv.classList.remove('hidden');
        setTimeout(() => resultDiv.classList.add('hidden'), 5000);
    }

    renderMCPServers() {
        const container = document.getElementById('mcpServers');
        if (!container) return;
        const servers = this.settingsManager.mcpService.getAllServers();

        if (servers.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666;">暂无MCP服务器</p>';
            return;
        }

        container.innerHTML = servers.map(server => `
            <div class="mcp-server ${server.status === 'error' ? 'error' : ''}">
                <div class="mcp-server-info">
                    <div class="mcp-server-name">${server.name}</div>
                    <div class="mcp-server-description">${server.description}</div>
                </div>
                <div class="mcp-server-actions">
                    <span class="mcp-server-status ${server.status}">${this.getStatusText(server.status)}</span>
                    <label class="mcp-toggle">
                        <input type="checkbox" ${server.status === 'connected' ? 'checked' : ''} data-server-name="${server.name}">
                        <span class="mcp-slider"></span>
                    </label>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.mcp-toggle input').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.toggleMCPServer(e.target.dataset.serverName, e.target.checked);
            });
        });
    }

    async toggleMCPServer(serverName, enabled) {
        try {
            if (enabled) {
                await this.settingsManager.mcpService.connectToServer(serverName);
            } else {
                await this.settingsManager.mcpService.disconnectFromServer(serverName);
            }
        } catch (error) {
            alert(`操作失败: ${error.message}`);
        } finally {
            this.renderMCPServers();
            this.refreshMCPServiceList();
        }
    }

    getStatusText(status) {
        const statusMap = {
            'connected': '已连接',
            'disconnected': '未连接',
            'connecting': '连接中',
            'error': '错误'
        };
        return statusMap[status] || status;
    }
}
