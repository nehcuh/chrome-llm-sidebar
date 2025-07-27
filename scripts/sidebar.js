class SidebarApp {
    constructor() {
        this.messages = [];
        this.config = {
            apiUrl: 'https://api.openai.com/v1',
            apiKey: '',
            temperature: 0.7,
            model: 'gpt-3.5-turbo'
        };
        this.searchService = new SearchService();
        this.mcpService = new MCPService(); 
        this.mcpConfigManager = new MCPConfigManager();
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.setupMessageListener();
        this.renderMessages();
    }

    async loadConfig() {
        try {
            const stored = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'temperature', 'model']);
            this.config = { ...this.config, ...stored };
            this.updateSettingsUI();
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const settingsBtn = document.getElementById('settingsBtn');
        const closeSettings = document.getElementById('closeSettings');
        const clearBtn = document.getElementById('clearBtn');
        const saveSettings = document.getElementById('saveSettings');
        const resetSettings = document.getElementById('resetSettings');
        const temperatureSlider = document.getElementById('temperature');
        const testBridgeConnection = document.getElementById('testBridgeConnection');
        const addMCPServer = document.getElementById('addMCPServer');
        const showConfigTemplate = document.getElementById('showConfigTemplate');
        const loadSampleConfig = document.getElementById('loadSampleConfig');
        const validateMCPConfig = document.getElementById('validateMCPConfig');
        const importMCPConfig = document.getElementById('importMCPConfig');
        const exportMCPConfig = document.getElementById('exportMCPConfig');
        const mcpToolsEnabled = document.getElementById('mcpToolsEnabled');
        const selectAllMCP = document.getElementById('selectAllMCP');
        const clearAllMCP = document.getElementById('clearAllMCP');
        const refreshMCP = document.getElementById('refreshMCP');

        console.log('Elements found:', {
            settingsBtn: !!settingsBtn,
            closeSettings: !!closeSettings,
            settingsPanel: !!document.getElementById('settingsPanel')
        });

        messageInput.addEventListener('input', () => {
            this.handleInputChange();
            this.autoResize(messageInput);
        });

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        sendBtn.addEventListener('click', () => this.sendMessage());
        
        // 设置按钮事件 - 添加调试
        if (settingsBtn) {
            settingsBtn.addEventListener('click', async (e) => {
                console.log('Settings button clicked!');
                e.preventDefault();
                e.stopPropagation();
                await this.showSettings();
            });
            console.log('Settings button listener added');
        } else {
            console.error('Settings button not found!');
        }
        
        if (closeSettings) {
            closeSettings.addEventListener('click', () => this.hideSettings());
        }
        
        clearBtn.addEventListener('click', () => this.clearMessages());
        saveSettings.addEventListener('click', () => this.saveSettings());
        resetSettings.addEventListener('click', () => this.resetSettings());

        temperatureSlider.addEventListener('input', (e) => {
            document.getElementById('temperatureValue').textContent = e.target.value;
        });

        testBridgeConnection.addEventListener('click', () => this.testBridgeConnection());
        addMCPServer.addEventListener('click', () => this.showAddMCPServerDialog());
        showConfigTemplate.addEventListener('click', () => this.showConfigTemplateModal());
        loadSampleConfig.addEventListener('click', () => this.showSampleConfigMenu());
        validateMCPConfig.addEventListener('click', () => this.validateMCPConfig());
        importMCPConfig.addEventListener('click', () => this.importMCPConfig());
        exportMCPConfig.addEventListener('click', () => this.exportMCPConfig());

        // MCP工具开关事件监听
        mcpToolsEnabled.addEventListener('change', (e) => {
            this.toggleMCPServiceSelector(e.target.checked);
        });

        // MCP服务选择控制按钮
        selectAllMCP.addEventListener('click', () => {
            this.selectAllMCPServices();
        });

        clearAllMCP.addEventListener('click', () => {
            this.clearAllMCPServices();
        });

        refreshMCP.addEventListener('click', () => {
            this.refreshMCPServiceList();
        });

        // 添加标签切换事件监听
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabName = e.target.getAttribute('data-tab');
                this.switchMCPTab(tabName);
            });
        });

        // 初始化MCP服务选择器状态
        this.toggleMCPServiceSelector(mcpToolsEnabled.checked);
        this.refreshMCPServiceList();
        
        console.log('Event listeners setup complete');
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Sidebar received message:', message);
            if (message.action === 'openSettings') {
                console.log('Opening settings panel...');
                this.showSettings().then(() => {
                    console.log('Settings panel opened successfully');
                }).catch(error => {
                    console.error('Failed to open settings:', error);
                });
            }
        });
    }

    handleInputChange() {
        const messageInput = document.getElementById('messageInput');
        const sendBtn = document.getElementById('sendBtn');
        const hasText = messageInput.value.trim().length > 0;
        const hasConfig = this.config.apiUrl && this.config.apiKey;
        
        sendBtn.disabled = !hasText || !hasConfig;
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    }

    async enhanceMessageWithWebSearch(message) {
        try {
            if (this.searchService.shouldPerformSearch(message)) {
                const searchQuery = this.searchService.extractSearchQuery(message);
                const searchResults = await this.searchService.search(searchQuery, {
                    provider: 'duckduckgo',
                    maxResults: 3
                });
                
                return `${message}\n\n以下是相关的搜索信息：\n${searchResults}\n\n请基于上述信息回答我的问题。`;
            }
        } catch (error) {
            console.error('Web search failed:', error);
            // 搜索失败时添加提示
            return `${message}\n\n注意：网络搜索暂时不可用，我将基于现有知识回答您的问题。`;
        }
        return message;
    }

    async callOpenAIAPI(message) {
        const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [
                    ...this.messages.filter(m => m.role !== 'loading').map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content
                    })),
                    { role: 'user', content: message }
                ],
                temperature: parseFloat(this.config.temperature),
                max_tokens: 2000
            })
        });

        if (!response.ok) {
            let errorMessage = `API请求失败: ${response.status}`;
            
            try {
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage += ` - ${errorData.error.message || errorData.error.type || JSON.stringify(errorData.error)}`;
                }
            } catch (e) {
                errorMessage += ` ${response.statusText || ''}`;
            }
            
            // 添加针对常见错误的建议
            if (response.status === 400) {
                errorMessage += '\n\n可能的原因：\n1. API Key格式不正确\n2. 模型名称错误\n3. 请求参数有误\n请检查设置中的API配置';
            } else if (response.status === 401) {
                errorMessage += '\n\n认证失败，请检查API Key是否正确';
            } else if (response.status === 403) {
                errorMessage += '\n\n访问被拒绝，可能是权限或配额问题';
            } else if (response.status === 429) {
                errorMessage += '\n\n请求过于频繁，请稍后再试';
            } else if (response.status === 500) {
                errorMessage += '\n\n服务器内部错误，请稍后再试';
            }
            
            throw new Error(errorMessage);
        }

        const data = await response.json();
        
        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('API响应格式异常，请检查API配置');
        }
        
        return data.choices[0].message.content;
    }

    addMessage(role, content) {
        const messageId = Date.now().toString();
        const message = { id: messageId, role, content, timestamp: new Date() };
        
        this.messages.push(message);
        this.renderMessage(message);
        this.scrollToBottom();
        
        return messageId;
    }

    removeMessage(messageId) {
        this.messages = this.messages.filter(m => m.id !== messageId);
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            messageElement.remove();
        }
    }

    renderMessages() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        this.messages.forEach(message => this.renderMessage(message));
    }

    renderMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}`;
        messageElement.setAttribute('data-message-id', message.id);
        messageElement.textContent = message.content;
        chatMessages.appendChild(messageElement);
    }

    scrollToBottom() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    clearMessages() {
        if (confirm('确定要清除所有对话吗？')) {
            this.messages = [];
            this.renderMessages();
        }
    }

    async showSettings() {
        console.log('Showing settings panel...');
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            console.log('Settings panel found, removing hidden class');
            console.log('Current classes:', settingsPanel.className);
            
            // 强制移除hidden类
            settingsPanel.classList.remove('hidden');
            
            // 确保面板可见
            settingsPanel.style.display = 'block';
            settingsPanel.style.transform = 'translateX(0)';
            
            console.log('Settings panel classes after removal:', settingsPanel.className);
            console.log('Settings panel computed style:', window.getComputedStyle(settingsPanel).transform);
            
            // 等待MCP服务初始化完成
            console.log('等待MCP服务初始化完成...');
            if (this.mcpService && this.mcpService.init) {
                try {
                    await this.mcpService.init();
                } catch (error) {
                    console.log('MCP服务重新初始化失败:', error);
                }
            }
            
            this.renderMCPServers();
            this.updateBridgeStatus();
            await this.refreshMCPServiceList(); // 确保服务列表是最新的
            this.debugMCPStatus();
            
            console.log('Settings panel should now be visible');
        } else {
            console.error('Settings panel not found!');
        }
    }

    hideSettings() {
        console.log('Hiding settings panel...');
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            settingsPanel.classList.add('hidden');
            settingsPanel.style.display = '';
            settingsPanel.style.transform = '';
            console.log('Settings panel hidden');
        }
    }

    updateSettingsUI() {
        document.getElementById('apiUrl').value = this.config.apiUrl || '';
        document.getElementById('apiKey').value = this.config.apiKey || '';
        document.getElementById('temperature').value = this.config.temperature || 0.7;
        document.getElementById('temperatureValue').textContent = this.config.temperature || 0.7;
        document.getElementById('model').value = this.config.model || 'gpt-3.5-turbo';
        document.getElementById('bridgeUrl').value = this.mcpService.bridgeUrl || 'http://localhost:3001';
    }

    async saveSettings() {
        const newConfig = {
            apiUrl: document.getElementById('apiUrl').value.trim(),
            apiKey: document.getElementById('apiKey').value.trim(),
            temperature: parseFloat(document.getElementById('temperature').value),
            model: document.getElementById('model').value.trim()
        };

        const newBridgeUrl = document.getElementById('bridgeUrl').value.trim();

        if (!newConfig.apiUrl || !newConfig.apiKey) {
            alert('请填写API URL和API Key');
            return;
        }

        try {
            await chrome.storage.sync.set(newConfig);
            this.config = { ...this.config, ...newConfig };
            
            // 更新MCP桥接服务器URL
            if (newBridgeUrl !== this.mcpService.bridgeUrl) {
                this.mcpService.bridgeUrl = newBridgeUrl;
                await chrome.storage.sync.set({ mcpBridgeUrl: newBridgeUrl });
                await this.mcpService.checkBridgeConnection();
            }
            
            // 刷新MCP服务列表 - 确保聊天界面同步更新
            await this.refreshMCPServiceList();
            console.log('设置保存成功，已刷新MCP服务列表');
            
            this.hideSettings();
            this.handleInputChange();
            alert('设置已保存');
        } catch (error) {
            console.error('Failed to save settings:', error);
            alert('保存设置失败');
        }
    }

    async resetSettings() {
        if (confirm('确定要重置所有设置吗？')) {
            try {
                await chrome.storage.sync.clear();
                this.config = {
                    apiUrl: 'https://api.openai.com/v1',
                    apiKey: '',
                    temperature: 0.7,
                    model: 'gpt-3.5-turbo'
                };
                this.updateSettingsUI();
                alert('设置已重置');
            } catch (error) {
                console.error('Failed to reset settings:', error);
                alert('重置设置失败');
            }
        }
    }

    renderMCPServers() {
        const container = document.getElementById('mcpServers');
        const servers = this.mcpService.getAllServers();
        
        if (servers.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; margin: 10px 0;">暂无可用的MCP服务器</p>';
            return;
        }

        container.innerHTML = servers.map(server => `
            <div class="mcp-server ${server.status === 'error' ? 'error' : ''}">
                <div class="mcp-server-info">
                    <div class="mcp-server-name">${server.name}</div>
                    <div class="mcp-server-description">${server.description}</div>
                    ${server.tools && server.tools.length > 0 ? 
                        `<div class="mcp-server-config">工具: ${server.tools.map(t => t.name).join(', ')}</div>` : 
                        ''
                    }
                </div>
                <div class="mcp-server-actions">
                    <span class="mcp-server-status ${server.status}">${this.getStatusText(server.status)}</span>
                    <label class="mcp-toggle">
                        <input type="checkbox" ${server.status === 'connected' ? 'checked' : ''} 
                               data-server-name="${server.name}">
                        <span class="mcp-slider"></span>
                    </label>
                </div>
            </div>
        `).join('');
        
        // 添加事件监听器到每个toggle开关
        container.querySelectorAll('.mcp-toggle input').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const serverName = e.target.getAttribute('data-server-name');
                this.toggleMCPServer(serverName, e.target.checked);
            });
        });
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

    async toggleMCPServer(serverName, enabled) {
        console.log('切换MCP服务器:', serverName, '启用:', enabled);
        
        try {
            if (enabled) {
                // 显示连接状态
                this.updateServerStatus(serverName, 'connecting');
                await this.mcpService.connectToServer(serverName);
            } else {
                await this.mcpService.disconnectFromServer(serverName);
            }
            this.renderMCPServers();
            
            // 刷新聊天界面的MCP服务列表，确保状态同步
            await this.refreshMCPServiceList();
            console.log('MCP服务器状态已切换，服务列表已刷新');
        } catch (error) {
            console.error('Failed to toggle MCP server:', error);
            alert(`操作失败: ${error.message}`);
            
            // 重新渲染以恢复UI状态
            this.renderMCPServers();
            await this.refreshMCPServiceList();
        }
    }

    updateServerStatus(serverName, status) {
        const server = this.mcpService.mcpServers.get(serverName);
        if (server) {
            server.status = status;
            this.renderMCPServers();
        }
    }

    async testBridgeConnection() {
        const button = document.getElementById('testBridgeConnection');
        const originalText = button.textContent;
        
        button.textContent = '测试中...';
        button.disabled = true;
        
        try {
            const bridgeUrl = document.getElementById('bridgeUrl').value.trim();
            const response = await fetch(`${bridgeUrl}/api/health`);
            
            if (response.ok) {
                alert('桥接服务器连接成功！');
                this.updateBridgeStatus(true);
            } else {
                throw new Error('服务器响应异常');
            }
        } catch (error) {
            alert(`连接失败: ${error.message}`);
            this.updateBridgeStatus(false);
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    updateBridgeStatus(connected = null) {
        const indicator = document.getElementById('bridgeStatusIndicator');
        const text = document.getElementById('bridgeStatusText');
        
        const isConnected = connected !== null ? connected : this.mcpService.bridgeConnected;
        
        indicator.className = 'status-indicator ' + (isConnected ? 'connected' : '');
        text.textContent = isConnected ? '已连接' : '未连接';
    }

    showAddMCPServerDialog() {
        const name = prompt('服务器名称:');
        if (!name) return;
        
        const command = prompt('启动命令 (如: npx):');
        if (!command) return;
        
        const args = prompt('参数 (用空格分隔):');
        const description = prompt('描述:') || '';
        
        const server = {
            name,
            description,
            command,
            args: args ? args.split(' ') : [],
            status: 'disconnected',
            custom: true
        };
        
        this.mcpService.mcpServers.set(name, server);
        this.renderMCPServers();
    }

    // 增强消息处理，集成MCP工具调用
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message || !this.config.apiKey) return;

        messageInput.value = '';
        this.handleInputChange();
        messageInput.style.height = 'auto';

        this.addMessage('user', message);
        
        const loadingId = this.addMessage('loading', '正在思考...');
        
        try {
            let finalMessage = message;
            let toolsUsed = [];
            
            // 检查是否启用网络搜索
            const webSearchEnabled = document.getElementById('webSearchEnabled').checked;
            if (webSearchEnabled) {
                finalMessage = await this.enhanceMessageWithWebSearch(message);
                console.log('网络搜索增强后的消息:', finalMessage);
            }
            
            // 检查是否启用MCP工具
            const mcpToolsEnabled = document.getElementById('mcpToolsEnabled').checked;
            if (mcpToolsEnabled) {
                console.log('开始检查MCP工具...');
                const connectedServers = this.mcpService.getConnectedServers();
                const availableTools = this.mcpService.getAvailableTools();
                
                console.log('已连接服务器数量:', connectedServers.length);
                console.log('可用工具数量:', availableTools.length);
                
                if (availableTools.length > 0) {
                    const { message: enhancedMessage, toolsUsed: mcpToolsUsed } = await this.mcpService.enhanceMessageWithTools(finalMessage);
                    if (mcpToolsUsed.length > 0) {
                        finalMessage = enhancedMessage;
                        toolsUsed = mcpToolsUsed;
                        console.log('MCP工具调用成功:', mcpToolsUsed);
                    } else {
                        console.log('未调用任何MCP工具');
                    }
                } else {
                    console.log('没有可用的MCP工具');
                    // 只在工具开关开启且没有工具时添加提示
                    finalMessage += '\n\n[系统提示：MCP工具已启用但当前没有可用工具。请在设置中配置和启用MCP服务器以获得外部信息访问能力。]';
                }
            }
            
            // 准备发送给LLM的最终消息，包含工具结果信息
            let messageForLLM = finalMessage;
            
            // 如果使用了工具，生成适合LLM理解的格式
            if (toolsUsed.length > 0) {
                const toolInfo = toolsUsed.map(tool => ({
                    name: tool.name,
                    result: tool.result
                }));
                
                // 为LLM提供结构化的工具信息
                messageForLLM = this.formatMessageForLLM(message, toolInfo);
            }
            
            const response = await this.callOpenAIAPI(messageForLLM);
            this.removeMessage(loadingId);
            this.addMessage('assistant', response);
        } catch (error) {
            this.removeMessage(loadingId);
            this.addMessage('assistant', `错误: ${error.message}`);
            console.error('发送消息错误:', error);
        }
    }

    // 格式化消息给LLM，使其能够理解和使用工具结果
    formatMessageForLLM(originalMessage, toolResults) {
        if (!toolResults || toolResults.length === 0) {
            return originalMessage;
        }

        let formattedMessage = originalMessage + '\n\n';
        formattedMessage += '以下是相关工具调用的结果，请基于这些信息回答用户的问题：\n';
        
        toolResults.forEach((tool, index) => {
            formattedMessage += `\n${index + 1}. 工具 "${tool.name}" 的结果：\n`;
            if (typeof tool.result === 'string') {
                formattedMessage += `${tool.result}\n`;
            } else {
                formattedMessage += `${JSON.stringify(tool.result, null, 2)}\n`;
            }
        });
        
        formattedMessage += '\n请基于上述工具结果，用中文回答用户的问题。';
        
        return formattedMessage;
    }

    // MCP配置管理方法
    switchMCPTab(tabName) {
        // 更新标签状态
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            }
        });

        // 切换面板
        const visualPanel = document.getElementById('mcpVisualPanel');
        const jsonPanel = document.getElementById('mcpJsonPanel');

        if (tabName === 'json') {
            visualPanel.classList.add('hidden');
            jsonPanel.classList.remove('hidden');
            // 只在JSON文本框为空时才加载当前配置，避免覆盖用户编辑的内容
            const jsonConfig = document.getElementById('mcpJsonConfig');
            if (!jsonConfig.value.trim()) {
                this.loadCurrentConfigToJson();
            }
        } else {
            visualPanel.classList.remove('hidden');
            jsonPanel.classList.add('hidden');
        }
    }

    loadCurrentConfigToJson() {
        try {
            const currentConfig = this.mcpConfigManager.exportCurrentConfig(this.mcpService);
            const jsonTextarea = document.getElementById('mcpJsonConfig');
            if (jsonTextarea) {
                jsonTextarea.value = currentConfig;
                console.log('[MCP-DEBUG] 当前配置已加载到JSON编辑器');
            }
        } catch (error) {
            console.error('[MCP-ERROR] 加载配置到JSON编辑器失败:', error);
        }
    }

    showConfigTemplateModal() {
        const modalHtml = this.mcpConfigManager.generateTemplateModal();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    closeTemplateModal() {
        const modal = document.getElementById('configTemplateModal');
        if (modal) {
            modal.remove();
        }
    }

    loadConfigTemplate() {
        const template = JSON.stringify(this.mcpConfigManager.defaultTemplate, null, 2);
        document.getElementById('mcpJsonConfig').value = template;
        this.closeTemplateModal();
        this.switchMCPTab('json');
    }

    loadConfigExample(exampleName) {
        const example = this.mcpConfigManager.sampleConfigs[exampleName];
        if (example) {
            document.getElementById('mcpJsonConfig').value = JSON.stringify(example, null, 2);
            this.closeTemplateModal();
            this.switchMCPTab('json');
        }
    }

    showSampleConfigMenu() {
        const options = Object.keys(this.mcpConfigManager.sampleConfigs);
        const choice = prompt(`请选择示例配置:\n${options.map((opt, i) => `${i + 1}. ${opt}`).join('\n')}\n\n输入数字选择:`);
        
        if (choice && choice.match(/^\d+$/)) {
            const index = parseInt(choice) - 1;
            if (index >= 0 && index < options.length) {
                this.loadConfigExample(options[index]);
            }
        }
    }

    validateMCPConfig() {
        const configText = document.getElementById('mcpJsonConfig').value.trim();
        const resultDiv = document.getElementById('configValidationResult');
        
        if (!configText) {
            this.showValidationResult('error', '请输入配置内容');
            return;
        }

        const result = this.mcpConfigManager.validateConfig(configText);
        const formatted = this.mcpConfigManager.formatValidationResult(result);
        
        this.showValidationResult(formatted.type, formatted.message);
        
        return result;
    }

    showValidationResult(type, message) {
        const resultDiv = document.getElementById('configValidationResult');
        resultDiv.className = `validation-result ${type}`;
        resultDiv.textContent = message;
        resultDiv.classList.remove('hidden');
        
        // 自动隐藏成功消息
        if (type === 'success') {
            setTimeout(() => {
                resultDiv.classList.add('hidden');
            }, 5000);
        }
    }

    async importMCPConfig() {
        const validationResult = this.validateMCPConfig();
        
        if (!validationResult.valid) {
            return;
        }

        if (!confirm('导入配置将替换现有的MCP服务器设置，确认继续？')) {
            return;
        }

        try {
            const importResult = this.mcpConfigManager.importConfig(validationResult, this.mcpService);
            
            if (importResult.success) {
                // 保存配置到存储
                await this.mcpService.saveMCPConfig();
                console.log('[MCP-DEBUG] 配置已保存到存储');
                
                // 重新初始化MCP服务以加载新配置
                await this.mcpService.init();
                console.log('[MCP-DEBUG] MCP服务已重新初始化');
                
                // 更新可视化界面
                this.renderMCPServers();
                
                // 刷新聊天界面的MCP服务选择器
                await this.refreshMCPServiceList();
                
                alert(importResult.message);
                this.switchMCPTab('visual');
                
                console.log('MCP配置导入成功，已刷新所有界面');
            } else {
                alert(importResult.error);
            }
        } catch (error) {
            console.error('Import config failed:', error);
            alert(`导入失败: ${error.message}`);
        }
    }

    exportMCPConfig() {
        const config = this.mcpConfigManager.exportCurrentConfig(this.mcpService);
        
        // 复制到剪贴板
        navigator.clipboard.writeText(config).then(() => {
            alert('配置已复制到剪贴板');
        }).catch(() => {
            // 备用方案：显示在文本框中
            document.getElementById('mcpJsonConfig').value = config;
            this.switchMCPTab('json');
            alert('配置已加载到JSON编辑器');
        });
    }

    // 调试MCP状态
    debugMCPStatus() {
        console.log('=== MCP完整调试信息 ===');
        
        // 基本状态
        const bridgeStatus = this.mcpService.getBridgeStatus();
        console.log('桥接服务器连接状态:', bridgeStatus);
        
        // 服务器信息
        const allServers = this.mcpService.getAllServers();
        const connectedServers = this.mcpService.getConnectedServers();
        console.log('已配置的MCP服务器总数:', allServers.length);
        console.log('已连接的MCP服务器数:', connectedServers.length);
        
        // 详细服务器信息
        console.log('服务器详情:');
        allServers.forEach(server => {
            console.log(`  - ${server.name}:`, {
                status: server.status,
                description: server.description,
                type: server.type || 'process',
                url: server.url,
                command: server.command,
                args: server.args,
                toolCount: server.tools?.length || 0,
                tools: server.tools?.map(t => t.name) || []
            });
        });
        
        // 工具信息
        const availableTools = this.mcpService.getAvailableTools();
        console.log('可用工具总数:', availableTools.length);
        
        if (availableTools.length > 0) {
            console.log('可用工具列表:');
            availableTools.forEach(tool => {
                console.log(`  - ${tool.name} (来自 ${tool.serverName}):`, {
                    description: tool.description,
                    inputSchema: tool.inputSchema
                });
            });
        } else {
            console.warn('⚠️ 没有可用的MCP工具！');
            console.log('可能的原因:');
            console.log('1. MCP桥接服务器未连接');
            console.log('2. 没有启用任何MCP服务器');
            console.log('3. MCP服务器连接失败');
            console.log('4. MCP服务器没有提供工具');
        }
        
        // 环境检查
        console.log('环境检查:');
        console.log('- 浏览器支持fetch API:', typeof fetch !== 'undefined');
        console.log('- Chrome存储API可用:', typeof chrome !== 'undefined' && chrome.storage);
        console.log('- 桥接URL配置:', this.mcpService.bridgeUrl);
        
        // 网络连接测试建议
        if (!bridgeStatus.connected) {
            console.log('🔍 故障排查建议:');
            console.log('1. 检查MCP桥接服务器是否运行:', this.mcpService.bridgeUrl);
            console.log('2. 检查防火墙设置');
            console.log('3. 检查端口是否被占用');
            console.log('4. 尝试手动测试连接');
        }
        
        console.log('======================');
        
        // 返回综合状态
        return {
            bridgeConnected: bridgeStatus.connected,
            serversConfigured: allServers.length,
            serversConnected: connectedServers.length,
            toolsAvailable: availableTools.length,
            ready: bridgeStatus.connected && connectedServers.length > 0 && availableTools.length > 0
        };
    }

    // MCP服务选择器控制方法
    async toggleMCPServiceSelector(enabled) {
        const selector = document.getElementById('mcpServiceSelector');
        if (selector) {
            selector.style.display = enabled ? 'block' : 'none';
            
            // 如果启用MCP工具，确保加载最新的配置
            if (enabled) {
                console.log('[MCP-DEBUG] 启用MCP工具，重新加载配置...');
                await this.mcpService.loadMCPConfig();
                await this.mcpService.loadSavedServers();
                await this.refreshMCPServiceList();
                console.log('[MCP-DEBUG] MCP配置重新加载完成');
            }
        }
    }

    // 刷新MCP服务列表 - 简化版本，只显示服务名称
    async refreshMCPServiceList() {
        console.log('刷新MCP服务列表...');
        const container = document.getElementById('mcpServiceList');
        if (!container) return;

        // 获取所有可用的MCP服务器
        const allServers = this.mcpService.getAllServers();
        const selectedServices = await this.getSelectedMCPServices();
        
        console.log('可用服务器:', allServers.length);
        console.log('已选择服务:', selectedServices);

        if (allServers.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #666;">暂无MCP服务<br><small>请在设置中配置MCP服务器</small></div>';
            this.updateMCPServiceInfo([]);
            return;
        }

        // 生成简化的服务列表 - 只显示服务名称作为复选框
        container.innerHTML = allServers.map(server => {
            const isSelected = selectedServices.includes(server.name);
            const isConnected = server.status === 'connected';
            const isError = server.status === 'error';
            
            return `
                <div class="mcp-service-item-simple ${isSelected ? 'selected' : ''} ${isError ? 'disabled' : ''}" 
                     data-service-name="${server.name}">
                    <label class="mcp-service-label">
                        <input type="checkbox" class="mcp-service-checkbox" 
                               ${isSelected ? 'checked' : ''} 
                               ${isError ? 'disabled' : ''}>
                        <span class="mcp-service-name">${server.name}</span>
                        <span class="mcp-connection-indicator ${isConnected ? 'connected' : 'disconnected'}" 
                              title="${isConnected ? '已连接' : '未连接'}">●</span>
                    </label>
                </div>
            `;
        }).join('');

        // 添加复选框事件监听器 - 包含自动连接逻辑
        container.querySelectorAll('.mcp-service-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const serviceName = e.target.closest('.mcp-service-item-simple').getAttribute('data-service-name');
                const isChecked = e.target.checked;
                
                console.log(`服务 ${serviceName} ${isChecked ? '被选中' : '被取消选中'}`);
                
                if (isChecked) {
                    // 选中时，如果服务未连接则尝试自动连接
                    const server = this.mcpService.mcpServers.get(serviceName);
                    if (server && server.status !== 'connected') {
                        console.log(`尝试自动连接服务: ${serviceName}`);
                        try {
                            // 显示连接状态
                            this.updateServiceConnectionIndicator(serviceName, 'connecting');
                            await this.mcpService.connectToServer(serviceName);
                            console.log(`服务 ${serviceName} 连接成功`);
                            this.updateServiceConnectionIndicator(serviceName, 'connected');
                        } catch (error) {
                            console.error(`服务 ${serviceName} 连接失败:`, error);
                            this.updateServiceConnectionIndicator(serviceName, 'disconnected');
                            // 连接失败时可以选择是否取消选中
                            // e.target.checked = false;
                        }
                    }
                }
                
                // 更新选择状态
                this.updateMCPServiceSelection();
            });
        });

        this.updateMCPServiceInfo(selectedServices);
    }

    // 获取MCP服务图标
    getMCPServiceIcon(serviceName) {
        const iconMap = {
            'filesystem': '📁',
            'brave-search': '🔍',
            'git': '📋',
            'sqlite': '🗄️',
            'github': '🐙',
            'slack': '💬',
            'postgres': '🐘',
            'fetch': '🌐'
        };
        return iconMap[serviceName] || '🔧';
    }

    // 更新MCP服务选择
    updateMCPServiceSelection() {
        const container = document.getElementById('mcpServiceList');
        if (!container) return;

        const selectedServices = [];
        
        container.querySelectorAll('.mcp-service-checkbox:checked').forEach(checkbox => {
            const item = checkbox.closest('.mcp-service-item-simple');
            const serviceName = item.getAttribute('data-service-name');
            if (serviceName) {
                selectedServices.push(serviceName);
                item.classList.add('selected');
            }
        });

        container.querySelectorAll('.mcp-service-checkbox:not(:checked)').forEach(checkbox => {
            const item = checkbox.closest('.mcp-service-item-simple');
            item.classList.remove('selected');
        });

        console.log('选中的MCP服务:', selectedServices);
        
        // 保存到本地存储
        chrome.storage.local.set({ selectedMCPServices: selectedServices });
        
        // 更新UI显示已选择的服务数量
        this.updateMCPServiceInfo(selectedServices);
    }

    // 全选MCP服务
    async selectAllMCPServices() {
        const container = document.getElementById('mcpServiceList');
        if (!container) return;

        const checkboxes = container.querySelectorAll('.mcp-service-checkbox:not(:disabled)');
        
        // 逐个选中并尝试连接
        for (const checkbox of checkboxes) {
            if (!checkbox.checked) {
                checkbox.checked = true;
                checkbox.closest('.mcp-service-item-simple').classList.add('selected');
                
                // 触发连接逻辑
                const serviceName = checkbox.closest('.mcp-service-item-simple').getAttribute('data-service-name');
                const server = this.mcpService.mcpServers.get(serviceName);
                if (server && server.status !== 'connected') {
                    try {
                        this.updateServiceConnectionIndicator(serviceName, 'connecting');
                        await this.mcpService.connectToServer(serviceName);
                        this.updateServiceConnectionIndicator(serviceName, 'connected');
                    } catch (error) {
                        console.error(`批量连接服务 ${serviceName} 失败:`, error);
                        this.updateServiceConnectionIndicator(serviceName, 'disconnected');
                    }
                }
            }
        }
        
        this.updateMCPServiceSelection();
    }

    // 清空MCP服务选择
    clearAllMCPServices() {
        const container = document.getElementById('mcpServiceList');
        if (!container) return;

        container.querySelectorAll('.mcp-service-checkbox').forEach(checkbox => {
            checkbox.checked = false;
            checkbox.closest('.mcp-service-item-simple').classList.remove('selected');
        });
        
        this.updateMCPServiceSelection();
    }

    // 更新选中的MCP服务
    updateSelectedMCPServices() {
        // 保持向后兼容，但现在使用新的方法
        this.updateMCPServiceSelection();
    }

    // 加载已保存的MCP服务选择
    async loadSelectedMCPServices() {
        try {
            const stored = await chrome.storage.local.get(['selectedMCPServices']);
            const selectedServices = stored.selectedMCPServices || [];
            
            console.log('加载已保存的服务选择:', selectedServices);
            
            // 刷新列表时会自动应用已保存的选择
            return selectedServices;
        } catch (error) {
            console.error('加载MCP服务选择失败:', error);
            return [];
        }
    }

    // 更新MCP服务信息显示
    updateMCPServiceInfo(selectedServices) {
        const infoElement = document.getElementById('mcpServiceInfo');
        if (infoElement) {
            if (selectedServices.length === 0) {
                infoElement.textContent = '选择要使用的MCP服务（自动连接）';
            } else {
                infoElement.textContent = `已选择 ${selectedServices.length} 个服务: ${selectedServices.join(', ')}`;
            }
        }
    }

    // 更新服务连接状态指示器
    updateServiceConnectionIndicator(serviceName, status) {
        const container = document.getElementById('mcpServiceList');
        if (!container) return;
        
        const serviceItem = container.querySelector(`[data-service-name="${serviceName}"]`);
        if (serviceItem) {
            const indicator = serviceItem.querySelector('.mcp-connection-indicator');
            if (indicator) {
                indicator.className = `mcp-connection-indicator ${status}`;
                const statusText = {
                    'connected': '已连接',
                    'connecting': '连接中...',
                    'disconnected': '未连接',
                    'error': '错误'
                };
                indicator.title = statusText[status] || status;
            }
        }
    }

    // 获取选中的MCP服务列表
    async getSelectedMCPServices() {
        try {
            const stored = await chrome.storage.local.get(['selectedMCPServices']);
            return stored.selectedMCPServices || [];
        } catch (error) {
            console.error('获取选中服务失败:', error);
            return [];
        }
    }

    // 修改sendMessage方法以支持服务选择
    async sendMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();
        
        if (!message || !this.config.apiKey) return;

        messageInput.value = '';
        this.handleInputChange();
        messageInput.style.height = 'auto';

        this.addMessage('user', message);
        
        const loadingId = this.addMessage('loading', '正在思考...');
        
        try {
            let finalMessage = message;
            let toolsUsed = [];
            
            // 检查是否启用网络搜索
            const webSearchEnabled = document.getElementById('webSearchEnabled').checked;
            if (webSearchEnabled) {
                finalMessage = await this.enhanceMessageWithWebSearch(message);
                console.log('网络搜索增强后的消息:', finalMessage);
            }
            
            // 检查是否启用MCP工具
            const mcpToolsEnabled = document.getElementById('mcpToolsEnabled').checked;
            if (mcpToolsEnabled) {
                console.log('开始检查MCP工具...');
                
                // 获取用户选择的服务
                const selectedServices = await this.getSelectedMCPServices();
                console.log('用户选择的服务:', selectedServices);
                
                if (selectedServices.length > 0) {
                    // 只使用用户选择的服务
                    const availableTools = this.mcpService.getAvailableTools()
                        .filter(tool => selectedServices.includes(tool.serverName));
                    
                    console.log('可用工具数量:', availableTools.length);
                    console.log('可用工具列表:', availableTools.map(t => ({ name: t.name, server: t.serverName })));
                    
                    if (availableTools.length > 0) {
                        const { message: enhancedMessage, toolsUsed: mcpToolsUsed } = await this.mcpService.enhanceMessageWithTools(finalMessage);
                        if (mcpToolsUsed.length > 0) {
                            finalMessage = enhancedMessage;
                            toolsUsed = mcpToolsUsed;
                            console.log('MCP工具调用成功:', mcpToolsUsed);
                        } else {
                            console.log('未调用任何MCP工具');
                        }
                    } else {
                        console.log('所选服务中没有可用工具');
                        finalMessage += '\n\n[系统提示：您选择的MCP服务暂时没有可用工具，请检查服务连接状态。]';
                    }
                } else {
                    console.log('用户未选择任何MCP服务');
                    finalMessage += '\n\n[系统提示：MCP工具已启用但未选择任何服务。请在输入框下方的服务选择器中选择要使用的MCP服务。]';
                }
            }
            
            // 准备发送给LLM的最终消息，包含工具结果信息
            let messageForLLM = finalMessage;
            
            // 如果使用了工具，生成适合LLM理解的格式
            if (toolsUsed.length > 0) {
                const toolInfo = toolsUsed.map(tool => ({
                    name: tool.name,
                    result: tool.result
                }));
                
                // 为LLM提供结构化的工具信息
                messageForLLM = this.formatMessageForLLM(message, toolInfo);
            }
            
            const response = await this.callOpenAIAPI(messageForLLM);
            this.removeMessage(loadingId);
            this.addMessage('assistant', response);
        } catch (error) {
            this.removeMessage(loadingId);
            this.addMessage('assistant', `错误: ${error.message}`);
            console.error('发送消息错误:', error);
        }
    }
}

// 等待DOM加载完成后再创建实例
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating SidebarApp instance...');
    window.app = new SidebarApp();
});

// 备用方案：如果DOMContentLoaded已经触发，立即执行
if (document.readyState === 'loading') {
    // 仍在加载中，等待DOMContentLoaded
    console.log('Document still loading, waiting for DOMContentLoaded...');
} else {
    // DOM已经加载完成
    console.log('DOM already loaded, creating SidebarApp instance immediately...');
    window.app = new SidebarApp();
}