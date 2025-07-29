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
        
        // Ensure content is a string
        if (typeof content !== 'string') {
            content = JSON.stringify(content, null, 2);
        }
        
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
                <button class="preview-sync-btn" onclick="app.uiController.applyAutoSyncConfig()">
                    ⚡ 立即同步
                </button>
            </div>
            <div class="preview-content">
                <p>检测到有效的MCP配置，包含 <strong>${serverCount}</strong> 个服务器:</p>
                <p><em>${serverNames}${moreText}</em></p>
                <p class="preview-hint">💡 保存后将自动同步到可视化界面</p>
            </div>
        `;

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
        if (isWindows) {
            command = 'cd mcp-bridge && npm start';
        } else if (isMac) {
            command = 'cd mcp-bridge && npm start';
        } else {
            command = 'cd mcp-bridge && npm start';
        }

        const guideHTML = `
            <div class="startup-guide">
                <h3>🚀 手动启动桥接服务器</h3>
                <p>由于浏览器安全限制，需要手动启动桥接服务器。请按照以下步骤操作：</p>
                
                <div class="step">
                    <h4>步骤 1: 打开终端/命令提示符</h4>
                    <p>• Windows: 按 <kbd>Win</kbd> + <kbd>R</kbd>，输入 <code>cmd</code></p>
                    <p>• macOS: 按 <kbd>Cmd</kbd> + <kbd>空格</kbd>，输入 <code>Terminal</code></p>
                    <p>• Linux: 按 <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd></p>
                </div>
                
                <div class="step">
                    <h4>步骤 2: 导航到项目目录</h4>
                    <p><code>cd /path/to/your/chrome-llm-sidebar</code></p>
                </div>
                
                <div class="step">
                    <h4>步骤 3: 启动桥接服务器</h4>
                    <p><code>${command}</code></p>
                </div>
                
                <div class="step">
                    <h4>步骤 4: 等待启动完成</h4>
                    <p>看到类似 "MCP Bridge Server running on port 3001" 的消息即表示启动成功</p>
                </div>
                
                <div class="quick-actions">
                    <button onclick="app.uiController.copyStartupCommand('${command}')">📋 复制启动命令</button>
                    <button onclick="app.uiController.testConnectionAfterDelay()">⏱️ 30秒后自动测试连接</button>
                </div>
                
                <div class="tips">
                    <h4>💡 提示：</h4>
                    <ul>
                        <li>确保已安装 Node.js (版本 14 或更高)</li>
                        <li>首次运行前需要在 mcp-bridge 目录执行 <code>npm install</code></li>
                        <li>保持终端窗口开启以维持服务器运行</li>
                        <li>服务器启动后点击"测试连接"验证</li>
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
                    <button class="close-btn" onclick="this.closest('.startup-guide-modal').remove()">×</button>
                </div>
                <div class="modal-body">
                    ${guideHTML}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        
        // 点击背景关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 复制启动命令到剪贴板
    async copyStartupCommand(command) {
        try {
            await navigator.clipboard.writeText(command);
            alert('启动命令已复制到剪贴板！');
        } catch (error) {
            alert('复制失败，请手动复制命令');
        }
    }

    // 延迟测试连接
    testConnectionAfterDelay() {
        alert('将在30秒后自动测试连接，请确保在此期间启动桥接服务器...');
        
        setTimeout(async () => {
            try {
                const connected = await this.settingsManager.mcpService.checkBridgeConnection();
                if (connected) {
                    this.updateBridgeStatus(true);
                    alert('桥接服务器连接成功！');
                } else {
                    alert('桥接服务器仍未连接，请检查服务器是否正常启动');
                }
            } catch (error) {
                alert('连接测试失败: ' + error.message);
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
}
