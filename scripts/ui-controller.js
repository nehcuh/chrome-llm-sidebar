class UIController {
    constructor(chatService, settingsManager, sessionManager = null, promptManager = null) {
        this.chatService = chatService;
        this.settingsManager = settingsManager;
        this.sessionManager = sessionManager;
        this.promptManager = promptManager;
        this.richMediaRenderer = null;
        this.init();
    }

    async init() {
        // 初始化富媒体渲染器
        this.richMediaRenderer = new RichMediaRenderer();
        await this.richMediaRenderer.init();
        
        this.setupEventListeners();
        this.updateSettingsUI();
        this.renderMessages();
        await this.refreshMCPServiceList();
        this.handleInputChange();
        this.startMCPStatusMonitoring();
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
            mcpEnabled: document.getElementById('mcpEnabled'),
            mcpSettings: document.getElementById('mcpSettings'),
            mcpToolsEnabled: document.getElementById('mcpToolsEnabled'),
            selectAllMCP: document.getElementById('selectAllMCP'),
            clearAllMCP: document.getElementById('clearAllMCP'),
            refreshMCP: document.getElementById('refreshMCP'),
            validateMCPConfig: document.getElementById('validateMCPConfig'),
            importMCPConfig: document.getElementById('importMCPConfig'),
            exportMCPConfig: document.getElementById('exportMCPConfig'),
            startBridgeServer: document.getElementById('startBridgeServer'),
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

        elements.mcpEnabled.addEventListener('change', (e) => {
            this.toggleMCPSettings(e.target.checked);
        });
        
        elements.testBridgeConnection.addEventListener('click', () => this.testBridgeConnection());
        
        elements.mcpToolsEnabled.addEventListener('change', (e) => {
            this.toggleMCPServiceSelector(e.target.checked);
            this.updateMCPStatus();
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
        elements.startBridgeServer.addEventListener('click', () => this.startBridgeServer());
        
        // 文件上传处理
        const configFileInput = document.getElementById('importConfigFile');
        if (configFileInput) {
            configFileInput.addEventListener('change', (e) => this.handleConfigFileUpload(e));
        }
        
        // 实时配置同步 - JSON输入框变化时自动验证和预览
        const jsonConfigTextarea = document.getElementById('mcpJsonConfig');
        if (jsonConfigTextarea) {
            jsonConfigTextarea.addEventListener('input', this.debounce(() => this.handleJsonConfigChange(), 1000));
        }
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

        const mcpToolsEnabled = document.getElementById('mcpToolsEnabled').checked;
        const useFunctionCalling = document.getElementById('useFunctionCalling').checked;

        this.chatService.sendMessage(message, mcpToolsEnabled, useFunctionCalling, () => this.settingsManager.getSelectedMCPServices());
        
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

    async renderMessages() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        
        // 并行渲染所有消息
        const renderPromises = this.chatService.messages.map(message => this.renderMessage(message));
        await Promise.all(renderPromises);
        
        this.scrollToBottom();
    }

    clearMessages() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = '';
        this.scrollToBottom();
    }

    async renderMessage(message) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.role}`;
        messageElement.setAttribute('data-message-id', message.id);

        // 创建消息头部
        const messageHeader = document.createElement('div');
        messageHeader.className = 'message-header';
        
        // 创建消息角色标签
        const roleLabel = document.createElement('span');
        roleLabel.className = 'message-role';
        roleLabel.textContent = message.role === 'user' ? '用户' : '助手';
        messageHeader.appendChild(roleLabel);
        
        // 创建消息操作按钮
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        // 编辑按钮
        const editBtn = document.createElement('button');
        editBtn.className = 'message-action-btn edit-btn';
        editBtn.innerHTML = '✏️';
        editBtn.title = '编辑消息';
        editBtn.addEventListener('click', () => this.editMessage(message.id, message.content, message.role));
        actionsDiv.appendChild(editBtn);
        
        // 复制按钮
        const copyBtn = document.createElement('button');
        copyBtn.className = 'message-action-btn copy-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.title = '复制消息';
        copyBtn.addEventListener('click', () => this.copyMessage(message.content));
        actionsDiv.appendChild(copyBtn);
        
        // 基于此消息重新对话按钮
        const newChatBtn = document.createElement('button');
        newChatBtn.className = 'message-action-btn new-chat-btn';
        newChatBtn.innerHTML = '🔄';
        newChatBtn.title = '基于此消息重新对话';
        newChatBtn.addEventListener('click', () => this.startNewChatFromMessage(message.id, message.content, message.role));
        actionsDiv.appendChild(newChatBtn);
        
        messageHeader.appendChild(actionsDiv);
        messageElement.appendChild(messageHeader);
        
        // 创建消息内容区域
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        
        let content = message.content;
        
        // 使用富媒体渲染器渲染内容
        if (this.richMediaRenderer) {
            try {
                content = await this.richMediaRenderer.renderMessage(content, {
                    enableMarkdown: true,
                    enableHtml: true,
                    enableMermaid: true,
                    enableKaTeX: true,
                    enableCopy: true
                });
            } catch (error) {
                console.error('Rich media rendering failed:', error);
                // 降级到基本HTML转义
                content = this.escapeHtml(content);
            }
        } else {
            // 降级到基本渲染
            content = this.escapeHtml(content);
            content = content.replace(/```(.*?)```/gs, '<pre><code>$1</code></pre>');
        }

        messageContent.innerHTML = content;
        messageElement.appendChild(messageContent);
        
        chatMessages.appendChild(messageElement);
        
        // 设置复制按钮事件
        if (this.richMediaRenderer) {
            this.richMediaRenderer.setupCopyButtons(messageContent);
        }
        
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

    showTaskStatus(text, type = 'in-progress') {
        const statusDiv = document.getElementById('taskStatus');
        statusDiv.textContent = text;
        statusDiv.className = `task-status ${type}`;
        statusDiv.classList.remove('hidden');
    }

    hideTaskStatus() {
        const statusDiv = document.getElementById('taskStatus');
        statusDiv.classList.add('hidden');
    }

    updateSettingsUI() {
        const config = this.settingsManager.config;
        document.getElementById('apiUrl').value = config.apiUrl;
        document.getElementById('apiKey').value = config.apiKey;
        document.getElementById('temperature').value = config.temperature;
        document.getElementById('temperatureValue').textContent = config.temperature;
        document.getElementById('model').value = config.model;
        
        // Update MCP enabled switch
        const mcpEnabled = document.getElementById('mcpEnabled');
        if (mcpEnabled) {
            mcpEnabled.checked = config.mcpEnabled || false;
            this.toggleMCPSettings(config.mcpEnabled || false);
        }
        
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

    toggleMCPSettings(enabled) {
        const mcpSettings = document.getElementById('mcpSettings');
        if (mcpSettings) {
            mcpSettings.style.display = enabled ? 'block' : 'none';
        }
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
            const importResult = this.settingsManager.mcpConfigManager.importConfigAutoSync(validationResult, this.settingsManager.mcpService, this);
            if (importResult.success) {
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
            this.updateMCPStatus();
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

    // 处理配置文件上传
    async handleConfigFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            alert('请选择JSON格式的配置文件');
            return;
        }

        const button = event.target.parentElement;
        const originalText = button.querySelector('span').textContent;
        button.querySelector('span').textContent = '上传中...';
        button.disabled = true;

        try {
            const importResult = await this.settingsManager.mcpConfigManager.importConfigFromFile(
                file, 
                this.settingsManager.mcpService, 
                this
            );

            if (importResult.success) {
                alert(importResult.message);
                this.switchMCPTab('visual');
            } else {
                alert(importResult.error);
            }
        } catch (error) {
            alert(`文件上传失败: ${error.message}`);
        } finally {
            button.querySelector('span').textContent = originalText;
            button.disabled = false;
            event.target.value = ''; // 清空文件输入
        }
    }

    // 处理JSON配置变化（实时同步）
    handleJsonConfigChange() {
        const jsonTextarea = document.getElementById('mcpJsonConfig');
        const configText = jsonTextarea.value.trim();

        if (!configText) {
            this.hideAutoSyncPreview();
            return;
        }

        try {
            const validationResult = this.settingsManager.mcpConfigManager.validateConfig(configText);
            
            if (validationResult.valid) {
                this.showAutoSyncPreview(validationResult.config);
            } else {
                this.hideAutoSyncPreview();
            }
        } catch (error) {
            // 静默处理JSON语法错误
            this.hideAutoSyncPreview();
        }
    }

    // 显示自动同步预览
    showAutoSyncPreview(config) {
        let previewPanel = document.getElementById('autoSyncPreview');
        
        if (!previewPanel) {
            previewPanel = document.createElement('div');
            previewPanel.id = 'autoSyncPreview';
            previewPanel.className = 'auto-sync-preview';
            
            const jsonPanel = document.getElementById('mcpJsonPanel');
            jsonPanel.appendChild(previewPanel);
        }

        const serverCount = Object.keys(config.mcpServers || {}).length;
        const serverNames = Object.keys(config.mcpServers || {}).slice(0, 3).join(', ');
        const moreText = serverCount > 3 ? ` 等${serverCount}个` : '';

        previewPanel.innerHTML = `
            <div class="preview-header">
                <span class="preview-title">🔄 配置预览</span>
                <button class="preview-sync-btn">
                    ⚡ 立即同步
                </button>
            </div>
            <div class="preview-content">
                <p>检测到有效的MCP配置，包含 <strong>${serverCount}</strong> 个服务器:</p>
                <p><em>${serverNames}${moreText}</em></p>
                <p class="preview-hint">💡 保存后将自动同步到可视化界面</p>
            </div>
        `;

        // 添加同步按钮事件监听器
        const syncBtn = previewPanel.querySelector('.preview-sync-btn');
        syncBtn.addEventListener('click', () => this.applyAutoSyncConfig());

        // 存储当前配置供同步使用
        this.pendingAutoSyncConfig = config;
    }

    // 隐藏自动同步预览
    hideAutoSyncPreview() {
        const previewPanel = document.getElementById('autoSyncPreview');
        if (previewPanel) {
            previewPanel.remove();
        }
        this.pendingAutoSyncConfig = null;
    }

    // 应用自动同步配置
    async applyAutoSyncConfig() {
        if (!this.pendingAutoSyncConfig) return;

        if (confirm('确定要应用此配置并同步到可视化界面吗？')) {
            try {
                const validationResult = {
                    valid: true,
                    config: this.pendingAutoSyncConfig
                };

                const importResult = this.settingsManager.mcpConfigManager.importConfigAutoSync(
                    validationResult, 
                    this.settingsManager.mcpService, 
                    this
                );

                if (importResult.success) {
                    this.hideAutoSyncPreview();
                    alert('配置已同步到可视化界面！');
                    this.switchMCPTab('visual');
                } else {
                    alert(importResult.error);
                }
            } catch (error) {
                alert(`同步失败: ${error.message}`);
            }
        }
    }

    // MCP状态监控
    startMCPStatusMonitoring() {
        this.updateMCPStatus();
        // 每10秒检查一次MCP状态
        setInterval(() => this.updateMCPStatus(), 10000);
    }

    async updateMCPStatus() {
        const indicator = document.getElementById('mcpStatusIndicator');
        const icon = indicator.querySelector('.mcp-status-icon');
        const text = indicator.querySelector('.mcp-status-text');
        
        if (!indicator) return;
        
        const mcpEnabled = document.getElementById('mcpToolsEnabled').checked;
        
        if (!mcpEnabled) {
            indicator.className = 'mcp-status-indicator disconnected';
            icon.textContent = '🔌';
            text.textContent = 'MCP已禁用';
            return;
        }
        
        indicator.className = 'mcp-status-indicator loading';
        icon.textContent = '⏳';
        text.textContent = '检查连接...';
        
        try {
            const bridgeConnected = this.settingsManager.mcpService.bridgeConnected;
            const servers = this.settingsManager.mcpService.getAllServers();
            const connectedServers = servers.filter(s => s.status === 'connected').length;
            
            if (bridgeConnected && connectedServers > 0) {
                indicator.className = 'mcp-status-indicator connected';
                icon.textContent = '✅';
                text.textContent = `${connectedServers}个MCP服务已连接`;
            } else if (bridgeConnected) {
                indicator.className = 'mcp-status-indicator disconnected';
                icon.textContent = '🔌';
                text.textContent = '桥接已连接，无MCP服务';
            } else {
                indicator.className = 'mcp-status-indicator disconnected';
                icon.textContent = '🔌';
                text.textContent = 'MCP未连接';
            }
        } catch (error) {
            indicator.className = 'mcp-status-indicator error';
            icon.textContent = '❌';
            text.textContent = '连接错误';
        }
    }

    // 一键启动桥接服务器
    async startBridgeServer() {
        const button = document.getElementById('startBridgeServer');
        const originalText = button.textContent;
        
        button.textContent = '启动中...';
        button.disabled = true;

        try {
            // 方法1: 尝试通过Chrome扩展协议启动（如果有相应的Native Messaging host）
            const launched = await this.tryLaunchViaNativeMessaging();
            
            if (launched) {
                // 等待服务器启动
                await this.waitForBridgeStartup();
                alert('桥接服务器启动成功！');
            } else {
                // 方法2: 提供手动启动指导
                this.showManualStartupGuide();
            }
        } catch (error) {
            console.error('启动桥接服务器失败:', error);
            this.showManualStartupGuide();
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    // 尝试通过Native Messaging启动
    async tryLaunchViaNativeMessaging() {
        try {
            // 检查是否有Native Messaging host
            if (typeof chrome !== 'undefined' && chrome.runtime) {
                // 这里可以连接到Native Messaging host来启动服务
                // 由于安全限制，这需要用户预先安装相应的host应用
                console.log('[MCP-DEBUG] 尝试通过Native Messaging启动服务器...');
                return false; // 暂时返回false，显示手动启动指导
            }
            return false;
        } catch (error) {
            console.error('Native Messaging启动失败:', error);
            return false;
        }
    }

    // 等待桥接服务器启动
    async waitForBridgeStartup(maxAttempts = 30) {
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const connected = await this.settingsManager.mcpService.checkBridgeConnection();
                if (connected) {
                    this.updateBridgeStatus(true);
                    return true;
                }
            } catch (error) {
                // 忽略连接错误，继续尝试
            }
            
            // 等待1秒
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        throw new Error('等待桥接服务器启动超时');
    }

    // 显示手动启动指导
    showManualStartupGuide() {
        const isWindows = navigator.platform.indexOf('Win') > -1;
        const isMac = navigator.platform.indexOf('Mac') > -1;
        
        let command = '';
        let platformName = '';
        
        if (isWindows) {
            command = 'cd mcp-bridge && npm start';
            platformName = 'Windows';
        } else if (isMac) {
            command = 'cd mcp-bridge && npm start';
            platformName = 'macOS';
        } else {
            command = 'cd mcp-bridge && npm start';
            platformName = 'Linux';
        }

        const guideHTML = `
            <div class="startup-guide">
                <h3>🚀 手动启动桥接服务器</h3>
                <p><strong>检测到您的平台：${platformName}</strong></p>
                <p>由于浏览器安全限制，需要手动启动桥接服务器。请按照以下步骤操作：</p>
                
                <div class="step">
                    <h4>步骤 1: 打开终端/命令提示符</h4>
                    ${isWindows ? `
                    <p>• 按 <kbd>Win</kbd> + <kbd>R</kbd>，输入 <code>cmd</code></p>
                    <p>• 或者在开始菜单中搜索"命令提示符"</p>
                    ` : isMac ? `
                    <p>• 按 <kbd>Cmd</kbd> + <kbd>空格</kbd>，输入 <code>Terminal</code></p>
                    <p>• 或者在应用程序 > 实用工具中找到终端</p>
                    ` : `
                    <p>• 按 <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd></p>
                    <p>• 或者在应用程序菜单中找到终端</p>
                    `}
                </div>
                
                <div class="step">
                    <h4>步骤 2: 导航到项目目录</h4>
                    <p><code>cd /path/to/your/chrome-llm-sidebar</code></p>
                    <p class="hint">💡 请替换为您的实际项目路径</p>
                </div>
                
                <div class="step">
                    <h4>步骤 3: 首次运行（仅第一次）</h4>
                    <p><code>cd mcp-bridge && npm install</code></p>
                    <p class="hint">💡 安装依赖包，只需要执行一次</p>
                </div>
                
                <div class="step">
                    <h4>步骤 4: 启动桥接服务器</h4>
                    <p><code>${command}</code></p>
                    <p class="hint">💡 保持终端窗口开启以维持服务器运行</p>
                </div>
                
                <div class="step">
                    <h4>步骤 5: 验证启动成功</h4>
                    <p>看到类似以下消息即表示启动成功：</p>
                    <div class="success-message">
                        <code>MCP Bridge Server running on port 3001</code>
                    </div>
                </div>
                
                <div class="quick-actions">
                    <button class="copy-command-btn" data-command="${command}">📋 复制启动命令</button>
                    <button class="copy-all-btn" data-commands="cd mcp-bridge && npm install${command}">📋 复制完整命令</button>
                    <button class="test-connection-btn">⏱️ 30秒后自动测试连接</button>
                </div>
                
                <div class="tips">
                    <h4>💡 重要提示：</h4>
                    <ul>
                        <li>确保已安装 Node.js (版本 14 或更高)</li>
                        <li>首次运行前必须执行 <code>npm install</code></li>
                        <li>保持终端窗口开启，关闭终端服务器将停止</li>
                        <li>如果端口3001被占用，可以修改配置文件中的端口号</li>
                        <li>启动后返回此页面点击"测试连接"验证</li>
                    </ul>
                </div>
                
                <div class="troubleshooting">
                    <h4>🔧 常见问题：</h4>
                    <ul>
                        <li><strong>命令不存在：</strong>请确保 Node.js 已正确安装</li>
                        <li><strong>端口被占用：</strong>修改 mcp-bridge/server.js 中的端口号</li>
                        <li><strong>权限问题：</strong>macOS/Linux 用户可能需要使用 <code>sudo</code></li>
                    </ul>
                </div>
            </div>
        `;

        // 创建模态框显示指导
        const modal = document.createElement('div');
        modal.className = 'startup-guide-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>桥接服务器启动指导</h2>
                    <button class="close-btn" type="button">×</button>
                </div>
                <div class="modal-body">
                    ${guideHTML}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // 存储模态框引用
        this.currentModal = modal;
        
        // 绑定关闭事件
        const closeBtn = modal.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => {
            this.closeStartupModal();
        });
        
        // 绑定复制命令事件
        const copyBtn = modal.querySelector('.copy-command-btn');
        copyBtn.addEventListener('click', () => {
            const command = copyBtn.dataset.command;
            this.copyStartupCommand(command);
        });
        
        // 绑定复制所有命令事件
        const copyAllBtn = modal.querySelector('.copy-all-btn');
        if (copyAllBtn) {
            copyAllBtn.addEventListener('click', () => {
                const commands = copyAllBtn.dataset.commands;
                this.copyStartupCommand(commands);
            });
        }
        
        // 绑定测试连接事件
        const testBtn = modal.querySelector('.test-connection-btn');
        testBtn.addEventListener('click', () => {
            this.testConnectionAfterDelay();
        });
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeStartupModal();
            }
        });
        
        // ESC键关闭
        const handleEscKey = (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.closeStartupModal();
                document.removeEventListener('keydown', handleEscKey);
            }
        };
        document.addEventListener('keydown', handleEscKey);
    }

    // 关闭启动模态框
    closeStartupModal() {
        if (this.currentModal) {
            this.currentModal.remove();
            this.currentModal = null;
        }
    }

    // 复制启动命令到剪贴板
    async copyStartupCommand(command) {
        try {
            await navigator.clipboard.writeText(command);
            this.showNotification('✅ 启动命令已复制到剪贴板！', 'success');
        } catch (error) {
            console.error('复制失败:', error);
            // 降级方案：创建文本选择
            const textArea = document.createElement('textarea');
            textArea.value = command;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                this.showNotification('✅ 启动命令已复制到剪贴板！', 'success');
            } catch (execError) {
                this.showNotification('❌ 复制失败，请手动复制命令', 'error');
            }
            
            document.body.removeChild(textArea);
        }
    }

    // 显示通知
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" type="button">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // 添加动画效果
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // 绑定关闭事件
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.hideNotification(notification);
        });
        
        // 自动关闭
        setTimeout(() => {
            this.hideNotification(notification);
        }, 3000);
    }

    // 隐藏通知
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }

    // 延迟测试连接
    testConnectionAfterDelay() {
        this.showNotification('⏱️ 将在30秒后自动测试连接，请确保在此期间启动桥接服务器...', 'info');
        
        setTimeout(async () => {
            try {
                const connected = await this.settingsManager.mcpService.checkBridgeConnection();
                if (connected) {
                    this.updateBridgeStatus(true);
                    this.updateMCPStatus();
                    this.showNotification('✅ 桥接服务器连接成功！', 'success');
                } else {
                    this.showNotification('❌ 桥接服务器仍未连接，请检查服务器是否正常启动', 'error');
                }
            } catch (error) {
                this.showNotification('❌ 连接测试失败: ' + error.message, 'error');
            }
        }, 30000);
    }

    // 防抖函数
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 编辑消息
     */
    editMessage(messageId, content, role) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const messageContent = messageElement.querySelector('.message-content');
        if (!messageContent) return;

        // 创建编辑模式
        const editDiv = document.createElement('div');
        editDiv.className = 'message-edit-mode';
        
        const textarea = document.createElement('textarea');
        textarea.className = 'message-edit-textarea';
        textarea.value = content;
        textarea.rows = Math.max(3, Math.min(10, content.split('\n').length));
        
        const buttonDiv = document.createElement('div');
        buttonDiv.className = 'message-edit-buttons';
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'message-edit-btn save-btn';
        saveBtn.innerHTML = '💾 保存';
        saveBtn.addEventListener('click', () => this.saveEditedMessage(messageId, textarea.value, role));
        
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'message-edit-btn cancel-btn';
        cancelBtn.innerHTML = '❌ 取消';
        cancelBtn.addEventListener('click', () => this.cancelEditMessage(messageId));
        
        buttonDiv.appendChild(saveBtn);
        buttonDiv.appendChild(cancelBtn);
        
        editDiv.appendChild(textarea);
        editDiv.appendChild(buttonDiv);
        
        // 隐藏原始内容，显示编辑界面
        messageContent.style.display = 'none';
        messageElement.appendChild(editDiv);
        
        // 聚焦到文本框
        textarea.focus();
        textarea.select();
    }

    /**
     * 保存编辑的消息
     */
    async saveEditedMessage(messageId, newContent, role) {
        try {
            // 更新消息内容
            const message = this.chatService.messages.find(m => m.id === messageId);
            if (message) {
                message.content = newContent;
                
                // 重新渲染消息
                const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
                if (messageElement) {
                    // 移除编辑模式
                    const editMode = messageElement.querySelector('.message-edit-mode');
                    if (editMode) {
                        editMode.remove();
                    }
                    
                    // 显示内容区域
                    const messageContent = messageElement.querySelector('.message-content');
                    if (messageContent) {
                        messageContent.style.display = 'block';
                        
                        // 重新渲染内容
                        let content = newContent;
                        if (this.richMediaRenderer) {
                            try {
                                content = await this.richMediaRenderer.renderMessage(content, {
                                    enableMarkdown: true,
                                    enableHtml: true,
                                    enableMermaid: true,
                                    enableKaTeX: true,
                                    enableCopy: true
                                });
                            } catch (error) {
                                console.error('Rich media rendering failed:', error);
                                content = this.escapeHtml(newContent);
                            }
                        } else {
                            content = this.escapeHtml(newContent);
                        }
                        
                        messageContent.innerHTML = content;
                        
                        // 重新设置复制按钮事件
                        if (this.richMediaRenderer) {
                            this.richMediaRenderer.setupCopyButtons(messageContent);
                        }
                    }
                }
                
                // 显示成功消息
                this.showNotification('✅ 消息已更新', 'success');
            }
        } catch (error) {
            console.error('Failed to save edited message:', error);
            this.showNotification('❌ 保存失败', 'error');
        }
    }

    /**
     * 取消编辑消息
     */
    cancelEditMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageElement) return;

        const editMode = messageElement.querySelector('.message-edit-mode');
        if (editMode) {
            editMode.remove();
        }
        
        const messageContent = messageElement.querySelector('.message-content');
        if (messageContent) {
            messageContent.style.display = 'block';
        }
    }

    /**
     * 复制消息内容
     */
    async copyMessage(content) {
        try {
            await navigator.clipboard.writeText(content);
            this.showNotification('✅ 消息已复制到剪贴板', 'success');
        } catch (error) {
            console.error('Failed to copy message:', error);
            this.showNotification('❌ 复制失败', 'error');
        }
    }

    /**
     * 基于历史消息重新开启对话
     */
    startNewChatFromMessage(messageId, content, role) {
        if (confirm('确定要基于此消息重新开启对话吗？这将清除当前对话内容。')) {
            // 清除当前对话
            this.chatService.clearMessages();
            this.renderMessages();
            
            // 将历史消息作为新的用户输入
            const messageInput = document.getElementById('messageInput');
            messageInput.value = content;
            this.handleInputChange();
            
            // 聚焦到输入框
            messageInput.focus();
            
            this.showNotification('✅ 已基于历史消息创建新对话', 'success');
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close" type="button">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // 添加动画效果
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // 绑定关闭事件
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.hideNotification(notification);
        });
        
        // 自动关闭
        setTimeout(() => {
            this.hideNotification(notification);
        }, 3000);
    }

    /**
     * 隐藏通知
     */
    hideNotification(notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }

    /**
     * HTML转义
     */
    escapeHtml(unsafe) {
        if (typeof unsafe !== 'string') {
            unsafe = String(unsafe);
        }
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
