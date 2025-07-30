/**
 * UI组件管理器
 * 管理会话和Prompt面板的交互逻辑
 */
class UIComponentManager {
    constructor(sessionManager, promptManager, chatService) {
        this.sessionManager = sessionManager;
        this.promptManager = promptManager;
        this.chatService = chatService;
        
        this.currentPanel = null;
        this.sessionMenu = null;
        this.searchTimeout = null;
        
        // 虚拟滚动配置
        this.sessionBatchSize = 20;
        this.currentSessionOffset = 0;
        this.allSessionsLoaded = false;
        this.searchCache = new Map();
        this.cacheTimeout = 30000; // 30秒缓存
        
        this.init();
    }

    /**
     * 初始化组件管理器
     */
    init() {
        this.setupEventListeners();
        this.setupSessionManagerListeners();
        this.setupPromptManagerListeners();
        this.renderSessions();
        this.renderPrompts();
    }

    /**
     * 设置事件监听器
     */
    setupEventListeners() {
        // 会话管理按钮
        document.getElementById('sessionBtn')?.addEventListener('click', () => {
            this.toggleSessionPanel();
        });

        // Prompt管理按钮
        document.getElementById('promptBtn')?.addEventListener('click', () => {
            this.togglePromptPanel();
        });

        // 关闭面板按钮
        document.getElementById('closeSessionPanel')?.addEventListener('click', () => {
            this.hideSessionPanel();
        });

        document.getElementById('closePromptPanel')?.addEventListener('click', () => {
            this.hidePromptPanel();
        });

        // 新建会话按钮
        document.getElementById('newSessionBtn')?.addEventListener('click', () => {
            this.showNewSessionModal();
        });

        // 导入会话按钮
        document.getElementById('importSessionBtn')?.addEventListener('click', () => {
            this.showImportSessionModal();
        });

        // 新建Prompt按钮
        document.getElementById('newPromptBtn')?.addEventListener('click', () => {
            this.showNewPromptModal();
        });

        // 搜索功能
        document.getElementById('sessionSearch')?.addEventListener('input', (e) => {
            this.handleSessionSearch(e.target.value);
        });

        // 过滤器切换
        document.getElementById('sessionFilterToggle')?.addEventListener('click', () => {
            this.toggleSessionFilterPanel();
        });

        // 过滤器应用
        document.getElementById('applySessionFilters')?.addEventListener('click', () => {
            this.applySessionFilters();
        });

        // 过滤器清除
        document.getElementById('clearSessionFilters')?.addEventListener('click', () => {
            this.clearSessionFilters();
        });

        document.getElementById('promptSearch')?.addEventListener('input', (e) => {
            this.handlePromptSearch(e.target.value);
        });

        // 分类过滤
        document.getElementById('promptCategoryFilter')?.addEventListener('change', (e) => {
            this.handlePromptCategoryFilter(e.target.value);
        });

        // 点击外部关闭菜单
        document.addEventListener('click', (e) => {
            if (this.sessionMenu && !this.sessionMenu.contains(e.target)) {
                this.hideSessionMenu();
            }
        });

        // 虚拟滚动事件
        this.setupVirtualScroll();
    }

    /**
     * 设置虚拟滚动
     */
    setupVirtualScroll() {
        const sessionContainer = document.querySelector('.session-list-container');
        if (!sessionContainer) return;

        sessionContainer.addEventListener('scroll', () => {
            this.handleSessionScroll();
        });
    }

    /**
     * 处理会话列表滚动
     */
    handleSessionScroll() {
        const container = document.querySelector('.session-list-container');
        const loadingIndicator = document.getElementById('sessionLoadingIndicator');
        
        if (!container || this.allSessionsLoaded) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        const threshold = 100; // 距离底部100px时开始加载

        if (scrollTop + clientHeight >= scrollHeight - threshold) {
            this.loadMoreSessions();
        }
    }

    /**
     * 加载更多会话
     */
    async loadMoreSessions() {
        if (this.allSessionsLoaded) return;

        const loadingIndicator = document.getElementById('sessionLoadingIndicator');
        loadingIndicator.classList.remove('hidden');

        try {
            const sessions = await this.sessionManager.getAllSessions();
            const newSessions = sessions.slice(this.currentSessionOffset, this.currentSessionOffset + this.sessionBatchSize);
            
            if (newSessions.length === 0) {
                this.allSessionsLoaded = true;
                loadingIndicator.classList.add('hidden');
                return;
            }

            await this.renderSessionBatch(newSessions);
            this.currentSessionOffset += newSessions.length;
            
            if (this.currentSessionOffset >= sessions.length) {
                this.allSessionsLoaded = true;
            }
        } catch (error) {
            console.error('Failed to load more sessions:', error);
        } finally {
            loadingIndicator.classList.add('hidden');
        }
    }

    /**
     * 渲染会话批次
     */
    async renderSessionBatch(sessions) {
        const sessionList = document.getElementById('sessionList');
        if (!sessionList) return;

        const currentSessionId = this.sessionManager.currentSessionId;

        sessions.forEach(session => {
            const sessionItem = this.createSessionItem(session, session.id === currentSessionId);
            sessionList.appendChild(sessionItem);
        });
    }

    /**
     * 重置虚拟滚动
     */
    resetVirtualScroll() {
        this.currentSessionOffset = 0;
        this.allSessionsLoaded = false;
        const sessionList = document.getElementById('sessionList');
        if (sessionList) {
            sessionList.innerHTML = '';
        }
        const container = document.querySelector('.session-list-container');
        if (container) {
            container.scrollTop = 0;
        }
    }

    /**
     * 设置会话管理器监听器
     */
    setupSessionManagerListeners() {
        this.sessionManager.on('sessionCreated', (session) => {
            this.renderSessions();
            this.showNotification('会话创建成功', 'success');
        });

        this.sessionManager.on('sessionUpdated', (session) => {
            this.renderSessions();
        });

        this.sessionManager.on('sessionDeleted', (session) => {
            this.renderSessions();
            this.showNotification('会话已删除', 'info');
        });

        this.sessionManager.on('currentSessionChanged', (session) => {
            this.renderSessions();
            this.loadSessionMessages(session);
        });
    }

    /**
     * 设置Prompt管理器监听器
     */
    setupPromptManagerListeners() {
        this.promptManager.on('promptCreated', (prompt) => {
            this.renderPrompts();
            this.updatePromptCategoryFilter();
            this.showNotification('Prompt模板创建成功', 'success');
        });

        this.promptManager.on('promptUpdated', (prompt) => {
            this.renderPrompts();
        });

        this.promptManager.on('promptDeleted', (prompt) => {
            this.renderPrompts();
            this.showNotification('Prompt模板已删除', 'info');
        });
    }

    /**
     * 切换会话面板
     */
    toggleSessionPanel() {
        const sessionPanel = document.getElementById('sessionPanel');
        const promptPanel = document.getElementById('promptPanel');
        
        if (sessionPanel.classList.contains('active')) {
            this.hideSessionPanel();
        } else {
            this.hidePromptPanel();
            sessionPanel.classList.add('active');
            this.currentPanel = 'session';
            this.renderSessions();
        }
    }

    /**
     * 切换Prompt面板
     */
    togglePromptPanel() {
        const sessionPanel = document.getElementById('sessionPanel');
        const promptPanel = document.getElementById('promptPanel');
        
        if (promptPanel.classList.contains('active')) {
            this.hidePromptPanel();
        } else {
            this.hideSessionPanel();
            promptPanel.classList.add('active');
            this.currentPanel = 'prompt';
            this.renderPrompts();
            this.updatePromptCategoryFilter();
        }
    }

    /**
     * 隐藏会话面板
     */
    hideSessionPanel() {
        const sessionPanel = document.getElementById('sessionPanel');
        sessionPanel.classList.remove('active');
        this.currentPanel = null;
    }

    /**
     * 隐藏Prompt面板
     */
    hidePromptPanel() {
        const promptPanel = document.getElementById('promptPanel');
        promptPanel.classList.remove('active');
        this.currentPanel = null;
    }

    /**
     * 渲染会话列表
     */
    renderSessions() {
        this.resetVirtualScroll();
        
        const sessionList = document.getElementById('sessionList');
        if (!sessionList) return;

        const sessions = this.sessionManager.getAllSessions();
        
        if (sessions.length === 0) {
            sessionList.innerHTML = '<div class="empty-state">暂无会话</div>';
            return;
        }

        // 加载第一批会话
        const firstBatch = sessions.slice(0, this.sessionBatchSize);
        this.renderSessionBatch(firstBatch);
        this.currentSessionOffset = firstBatch.length;
        this.allSessionsLoaded = firstBatch.length >= sessions.length;
    }

    /**
     * 创建会话项
     */
    createSessionItem(session, isActive, searchQuery = '') {
        const item = document.createElement('div');
        item.className = `session-item ${isActive ? 'active' : ''}`;
        item.dataset.sessionId = session.id;

        const updateTime = new Date(session.updatedAt).toLocaleString();
        const messageCount = session.messages?.length || 0;

        // 高亮搜索关键词
        const highlightedName = searchQuery ? 
            this.highlightText(session.name, searchQuery) : 
            this.escapeHtml(session.name);
        
        const highlightedDescription = searchQuery ? 
            this.highlightText(session.description || '无描述', searchQuery) : 
            this.escapeHtml(session.description || '无描述');

        item.innerHTML = `
            <div class="session-item-header">
                <div class="session-item-title">${highlightedName}</div>
                <div class="session-item-actions">
                    <button class="session-action-btn" data-session-id="${session.id}" title="更多操作">⋮</button>
                </div>
            </div>
            <div class="session-item-description">${highlightedDescription}</div>
            <div class="session-item-stats">
                <span>📝 ${messageCount} 条消息</span>
                <span>🕐 ${updateTime}</span>
            </div>
        `;

        // 点击切换会话
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.session-item-actions')) {
                this.switchToSession(session.id);
            }
        });
        
        // 会话操作按钮
        const actionBtn = item.querySelector('.session-action-btn');
        actionBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showSessionMenu(session.id, e);
        });

        return item;
    }

    /**
     * 显示会话菜单
     */
    showSessionMenu(sessionId, event) {
        event.stopPropagation();
        
        // 隐藏现有菜单
        this.hideSessionMenu();
        
        const menu = document.createElement('div');
        menu.className = 'session-menu';
        menu.style.left = event.pageX + 'px';
        menu.style.top = event.pageY + 'px';
        
        menu.innerHTML = `
            <div class="session-menu-item" data-action="rename" data-session-id="${sessionId}">
                📝 重命名
            </div>
            <div class="session-menu-item" data-action="duplicate" data-session-id="${sessionId}">
                📋 复制会话
            </div>
            <div class="session-menu-submenu">
                <div class="submenu-title">📤 导出会话</div>
                <div class="session-menu-item" data-action="export" data-format="json" data-session-id="${sessionId}">
                    📄 JSON格式
                </div>
                <div class="session-menu-item" data-action="export" data-format="markdown" data-session-id="${sessionId}">
                    📝 Markdown格式
                </div>
                <div class="session-menu-item" data-action="export" data-format="txt" data-session-id="${sessionId}">
                    📃 纯文本格式
                </div>
            </div>
            <div class="session-menu-item danger" data-action="delete" data-session-id="${sessionId}">
                🗑️ 删除会话
            </div>
        `;
        
        document.body.appendChild(menu);
        this.sessionMenu = menu;
        
        // 添加菜单项事件监听器
        const menuItems = menu.querySelectorAll('.session-menu-item');
        menuItems.forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                const sessionId = e.target.dataset.sessionId;
                const format = e.target.dataset.format;
                
                switch (action) {
                    case 'rename':
                        this.renameSession(sessionId);
                        break;
                    case 'duplicate':
                        this.duplicateSession(sessionId);
                        break;
                    case 'export':
                        this.exportSession(sessionId, format);
                        break;
                    case 'delete':
                        this.deleteSession(sessionId);
                        break;
                }
                
                this.hideSessionMenu();
            });
        });
    }

    /**
     * 隐藏会话菜单
     */
    hideSessionMenu() {
        if (this.sessionMenu) {
            this.sessionMenu.remove();
            this.sessionMenu = null;
        }
    }

    /**
     * 切换到指定会话
     */
    async switchToSession(sessionId) {
        try {
            await this.sessionManager.setCurrentSession(sessionId);
            this.hideSessionPanel();
        } catch (error) {
            this.showNotification('切换会话失败', 'error');
            console.error('Failed to switch session:', error);
        }
    }

    /**
     * 重命名会话
     */
    async renameSession(sessionId) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) return;

        const newName = prompt('请输入新的会话名称:', session.name);
        if (newName && newName.trim()) {
            try {
                await this.sessionManager.updateSession(sessionId, { name: newName.trim() });
                this.showNotification('会话重命名成功', 'success');
            } catch (error) {
                this.showNotification('重命名失败', 'error');
                console.error('Failed to rename session:', error);
            }
        }
        this.hideSessionMenu();
    }

    /**
     * 复制会话
     */
    async duplicateSession(sessionId) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) return;

        try {
            const newSession = await this.sessionManager.createSession(
                `${session.name} (副本)`,
                session.description
            );
            
            // 复制消息
            for (const message of session.messages) {
                await this.sessionManager.addMessage(newSession.id, message.role, message.content);
            }
            
            this.showNotification('会话复制成功', 'success');
        } catch (error) {
            this.showNotification('复制会话失败', 'error');
            console.error('Failed to duplicate session:', error);
        }
        this.hideSessionMenu();
    }

    /**
     * 导出会话
     */
    async exportSession(sessionId, format = 'json') {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) return;

        try {
            let content, mimeType, fileName;
            
            switch (format) {
                case 'json':
                    content = this.exportSessionAsJSON(session);
                    mimeType = 'application/json';
                    fileName = `${session.name}_${new Date().toISOString().split('T')[0]}.json`;
                    break;
                case 'markdown':
                    content = this.exportSessionAsMarkdown(session);
                    mimeType = 'text/markdown';
                    fileName = `${session.name}_${new Date().toISOString().split('T')[0]}.md`;
                    break;
                case 'txt':
                    content = this.exportSessionAsText(session);
                    mimeType = 'text/plain';
                    fileName = `${session.name}_${new Date().toISOString().split('T')[0]}.txt`;
                    break;
                default:
                    throw new Error('不支持的导出格式');
            }

            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            
            this.showNotification(`会话已导出为${format.toUpperCase()}格式`, 'success');
        } catch (error) {
            this.showNotification('导出会话失败', 'error');
            console.error('Failed to export session:', error);
        }
        this.hideSessionMenu();
    }

    /**
     * 导出为JSON格式
     */
    exportSessionAsJSON(session) {
        const exportData = {
            session: {
                id: session.id,
                name: session.name,
                description: session.description,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                metadata: session.metadata
            },
            messages: session.messages
        };
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * 导出为Markdown格式
     */
    exportSessionAsMarkdown(session) {
        let content = `# ${this.escapeHtml(session.name)}\n\n`;
        
        if (session.description) {
            content += `**描述:** ${this.escapeHtml(session.description)}\n\n`;
        }
        
        content += `**创建时间:** ${new Date(session.createdAt).toLocaleString()}\n`;
        content += `**更新时间:** ${new Date(session.updatedAt).toLocaleString()}\n`;
        content += `**消息数量:** ${session.messages?.length || 0}\n\n`;
        
        if (session.metadata?.tags && session.metadata.tags.length > 0) {
            content += `**标签:** ${session.metadata.tags.map(tag => `\`${tag}\``).join(', ')}\n\n`;
        }
        
        content += '---\n\n';
        
        if (session.messages && session.messages.length > 0) {
            session.messages.forEach(message => {
                const role = message.role === 'user' ? '用户' : '助手';
                const time = new Date(message.timestamp).toLocaleString();
                content += `### ${role}\n\n`;
                content += `**时间:** ${time}\n\n`;
                content += `${this.escapeHtml(message.content)}\n\n`;
                content += '---\n\n';
            });
        }
        
        return content;
    }

    /**
     * 导出为纯文本格式
     */
    exportSessionAsText(session) {
        let content = `${session.name}\n`;
        content += '='.repeat(session.name.length) + '\n\n';
        
        if (session.description) {
            content += `描述: ${session.description}\n\n`;
        }
        
        content += `创建时间: ${new Date(session.createdAt).toLocaleString()}\n`;
        content += `更新时间: ${new Date(session.updatedAt).toLocaleString()}\n`;
        content += `消息数量: ${session.messages?.length || 0}\n\n`;
        
        if (session.metadata?.tags && session.metadata.tags.length > 0) {
            content += `标签: ${session.metadata.tags.join(', ')}\n\n`;
        }
        
        content += '-'.repeat(50) + '\n\n';
        
        if (session.messages && session.messages.length > 0) {
            session.messages.forEach((message, index) => {
                const role = message.role === 'user' ? '用户' : '助手';
                const time = new Date(message.timestamp).toLocaleString();
                content += `${index + 1}. ${role} (${time})\n`;
                content += '-'.repeat(30) + '\n';
                content += `${message.content}\n\n`;
            });
        }
        
        return content;
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId) {
        const session = this.sessionManager.getSession(sessionId);
        if (!session) return;

        if (confirm(`确定要删除会话"${session.name}"吗？此操作不可恢复。`)) {
            try {
                await this.sessionManager.deleteSession(sessionId);
                this.showNotification('会话删除成功', 'success');
            } catch (error) {
                this.showNotification('删除会话失败', 'error');
                console.error('Failed to delete session:', error);
            }
        }
        this.hideSessionMenu();
    }

    /**
     * 渲染Prompt列表
     */
    renderPrompts() {
        const promptList = document.getElementById('promptList');
        if (!promptList) return;

        const prompts = this.promptManager.getAllPrompts();
        promptList.innerHTML = '';

        if (prompts.length === 0) {
            promptList.innerHTML = '<div class="empty-state">暂无Prompt模板</div>';
            return;
        }

        prompts.forEach(prompt => {
            const promptItem = this.createPromptItem(prompt);
            promptList.appendChild(promptItem);
        });
    }

    /**
     * 创建Prompt项
     */
    createPromptItem(prompt) {
        const item = document.createElement('div');
        item.className = 'prompt-item';
        item.dataset.promptId = prompt.id;

        const stars = '⭐'.repeat(Math.floor(prompt.rating || 0));
        const tags = (prompt.tags || []).map(tag => 
            `<span class="prompt-item-tag">${this.escapeHtml(tag)}</span>`
        ).join('');

        item.innerHTML = `
            <div class="prompt-item-header">
                <div>
                    <div class="prompt-item-title">${this.escapeHtml(prompt.name)}</div>
                    <div class="prompt-item-category">${this.escapeHtml(prompt.category)}</div>
                </div>
                <div class="prompt-item-actions">
                    ${this.isBuiltinPrompt(prompt) ? 
                        `<button class="prompt-edit-btn" title="编辑内置Prompt" data-prompt-id="${prompt.id}">✏️</button>` : 
                        `<button class="prompt-edit-btn" title="编辑Prompt" data-prompt-id="${prompt.id}">✏️</button>
                         <button class="prompt-delete-btn" title="删除Prompt" data-prompt-id="${prompt.id}">🗑️</button>`
                    }
                </div>
            </div>
            <div class="prompt-item-description">${this.escapeHtml(prompt.description)}</div>
            <div class="prompt-item-tags">${tags}</div>
            <div class="prompt-item-stats">
                <div class="prompt-item-rating">${stars} ${prompt.rating || 0}</div>
                <div>📊 使用 ${prompt.usageCount || 0} 次</div>
            </div>
        `;

        // 点击使用Prompt
        item.addEventListener('click', (e) => {
            // 如果点击的是按钮，不触发使用Prompt
            if (e.target.closest('.prompt-item-actions')) {
                return;
            }
            this.usePrompt(prompt.id);
        });

        // 编辑按钮事件
        const editBtn = item.querySelector('.prompt-edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editPrompt(prompt.id);
            });
        }

        // 删除按钮事件
        const deleteBtn = item.querySelector('.prompt-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deletePrompt(prompt.id);
            });
        }

        return item;
    }

    /**
     * 使用Prompt
     */
    async usePrompt(promptId) {
        try {
            const prompt = this.promptManager.getPrompt(promptId);
            if (!prompt) return;

            // 如果有变量，显示变量输入对话框
            if (prompt.variables && prompt.variables.length > 0) {
                this.showPromptVariableModal(prompt);
            } else {
                const result = await this.promptManager.usePrompt(promptId);
                // 将渲染后的模板插入到消息输入框
                const messageInput = document.getElementById('messageInput');
                if (messageInput) {
                    messageInput.value = result.renderedTemplate;
                    messageInput.focus();
                }
                this.hidePromptPanel();
            }
        } catch (error) {
            this.showNotification('使用Prompt失败', 'error');
            console.error('Failed to use prompt:', error);
        }
    }

    /**
     * 显示Prompt变量输入模态框
     */
    showPromptVariableModal(prompt) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">${this.escapeHtml(prompt.name)}</h3>
                    <button class="close-btn modal-close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">${this.escapeHtml(prompt.description)}</label>
                    </div>
                    ${prompt.variables.map(variable => `
                        <div class="form-group">
                            <label class="form-label">${this.escapeHtml(variable.description || variable.name)}</label>
                            ${variable.type === 'textarea' ? 
                                `<textarea class="form-textarea" id="var_${variable.name}" placeholder="${this.escapeHtml(variable.name)}" ${variable.required ? 'required' : ''}></textarea>` :
                                variable.type === 'select' ?
                                `<select class="form-select" id="var_${variable.name}" ${variable.required ? 'required' : ''}>
                                    ${variable.options.map(option => 
                                        `<option value="${option}" ${option === variable.default ? 'selected' : ''}>${option}</option>`
                                    ).join('')}
                                </select>` :
                                `<input type="${variable.type || 'text'}" class="form-input" id="var_${variable.name}" placeholder="${this.escapeHtml(variable.name)}" ${variable.required ? 'required' : ''}>`
                            }
                        </div>
                    `).join('')}
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel-btn">取消</button>
                    <button class="btn btn-primary modal-apply-btn">应用</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
        
        // 设置事件监听器
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = modal.querySelector('.modal-cancel-btn');
        const applyBtn = modal.querySelector('.modal-apply-btn');
        
        closeBtn.addEventListener('click', () => this.closeModal(closeBtn));
        cancelBtn.addEventListener('click', () => this.closeModal(cancelBtn));
        applyBtn.addEventListener('click', () => this.applyPromptWithVariables(prompt.id, modal));
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
    }

    /**
     * 应用Prompt（带变量）
     */
    async applyPromptWithVariables(promptId, modal) {
        try {
            const prompt = this.promptManager.getPrompt(promptId);
            if (!prompt) return;

            const variables = {};
            let allValid = true;

            for (const variable of prompt.variables) {
                const input = modal.querySelector(`#var_${variable.name}`);
                const value = input.value.trim();

                if (variable.required && !value) {
                    input.focus();
                    allValid = false;
                    break;
                }

                variables[variable.name] = value || '';
            }

            if (!allValid) return;

            const result = await this.promptManager.usePrompt(promptId, variables);
            
            // 将渲染后的模板插入到消息输入框
            const messageInput = document.getElementById('messageInput');
            if (messageInput) {
                messageInput.value = result.renderedTemplate;
                messageInput.focus();
            }

            this.closeModal(modal);
            this.hidePromptPanel();
        } catch (error) {
            this.showNotification('应用Prompt失败', 'error');
            console.error('Failed to apply prompt:', error);
        }
    }

    /**
     * 更新Prompt分类过滤器
     */
    updatePromptCategoryFilter() {
        const filter = document.getElementById('promptCategoryFilter');
        if (!filter) return;

        const categories = this.promptManager.getCategories();
        const currentValue = filter.value;

        filter.innerHTML = '<option value="">所有分类</option>';
        
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            filter.appendChild(option);
        });

        filter.value = currentValue;
    }

    /**
     * 处理会话搜索
     */
    handleSessionSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                // 检查缓存
                const cacheKey = query || 'all';
                const cached = this.searchCache.get(cacheKey);
                
                if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                    this.renderFilteredSessions(cached.data, query);
                    return;
                }
                
                // 执行搜索
                const sessions = query ? 
                    await this.sessionManager.searchSessions(query) : 
                    this.sessionManager.getAllSessions();
                
                // 缓存结果
                this.searchCache.set(cacheKey, {
                    data: sessions,
                    timestamp: Date.now()
                });
                
                // 清理过期缓存
                this.cleanSearchCache();
                
                this.renderFilteredSessions(sessions, query);
            } catch (error) {
                console.error('Failed to search sessions:', error);
            }
        }, 300);
    }

    /**
     * 清理搜索缓存
     */
    cleanSearchCache() {
        const now = Date.now();
        for (const [key, value] of this.searchCache.entries()) {
            if (now - value.timestamp > this.cacheTimeout) {
                this.searchCache.delete(key);
            }
        }
    }

    /**
     * 切换会话过滤器面板
     */
    toggleSessionFilterPanel() {
        const filterPanel = document.getElementById('sessionFilterPanel');
        if (filterPanel.classList.contains('hidden')) {
            filterPanel.classList.remove('hidden');
            this.loadSessionTags();
        } else {
            filterPanel.classList.add('hidden');
        }
    }

    /**
     * 加载会话标签
     */
    async loadSessionTags() {
        try {
            const sessions = this.sessionManager.getAllSessions();
            const allTags = new Set();
            
            sessions.forEach(session => {
                const tags = session.metadata?.tags || [];
                tags.forEach(tag => allTags.add(tag));
            });

            const tagFilter = document.getElementById('sessionTagFilter');
            tagFilter.innerHTML = '';
            
            Array.from(allTags).sort().forEach(tag => {
                const tagItem = document.createElement('div');
                tagItem.className = 'tag-filter-item';
                tagItem.textContent = tag;
                tagItem.dataset.tag = tag;
                
                tagItem.addEventListener('click', () => {
                    tagItem.classList.toggle('active');
                });
                
                tagFilter.appendChild(tagItem);
            });

            if (allTags.size === 0) {
                tagFilter.innerHTML = '<div class="empty-state">暂无标签</div>';
            }
        } catch (error) {
            console.error('Failed to load session tags:', error);
        }
    }

    /**
     * 应用会话过滤器
     */
    async applySessionFilters() {
        try {
            const query = document.getElementById('sessionSearch')?.value || '';
            const startDate = document.getElementById('sessionStartDate')?.value || '';
            const endDate = document.getElementById('sessionEndDate')?.value || '';
            
            const activeTagItems = document.querySelectorAll('#sessionTagFilter .tag-filter-item.active');
            const tags = Array.from(activeTagItems).map(item => item.dataset.tag);

            const options = {
                startDate,
                endDate,
                tags
            };

            const sessions = query ? 
                await this.sessionManager.searchSessions(query, options) : 
                await this.sessionManager.searchSessions('', options);

            this.renderFilteredSessions(sessions, query);
            this.showNotification('过滤器已应用', 'success');
        } catch (error) {
            console.error('Failed to apply session filters:', error);
            this.showNotification('应用过滤器失败', 'error');
        }
    }

    /**
     * 清除会话过滤器
     */
    clearSessionFilters() {
        document.getElementById('sessionStartDate').value = '';
        document.getElementById('sessionEndDate').value = '';
        document.querySelectorAll('#sessionTagFilter .tag-filter-item.active').forEach(item => {
            item.classList.remove('active');
        });
        
        const query = document.getElementById('sessionSearch')?.value || '';
        this.handleSessionSearch(query);
        this.showNotification('过滤器已清除', 'info');
    }

    /**
     * 处理Prompt搜索
     */
    handlePromptSearch(query) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(async () => {
            try {
                const category = document.getElementById('promptCategoryFilter')?.value || '';
                const prompts = query ? 
                    await this.promptManager.searchPrompts(query, { category }) : 
                    this.promptManager.getAllPrompts();
                
                this.renderFilteredPrompts(prompts);
            } catch (error) {
                console.error('Failed to search prompts:', error);
            }
        }, 300);
    }

    /**
     * 处理Prompt分类过滤
     */
    handlePromptCategoryFilter(category) {
        const searchQuery = document.getElementById('promptSearch')?.value || '';
        this.handlePromptSearch(searchQuery);
    }

    /**
     * 渲染过滤后的会话
     */
    renderFilteredSessions(sessions, searchQuery = '') {
        const sessionList = document.getElementById('sessionList');
        if (!sessionList) return;

        const currentSessionId = this.sessionManager.currentSessionId;

        sessionList.innerHTML = '';

        if (sessions.length === 0) {
            sessionList.innerHTML = '<div class="empty-state">没有找到匹配的会话</div>';
            return;
        }

        sessions.forEach(session => {
            const sessionItem = this.createSessionItem(session, session.id === currentSessionId, searchQuery);
            sessionList.appendChild(sessionItem);
        });
    }

    /**
     * 渲染过滤后的Prompt
     */
    renderFilteredPrompts(prompts) {
        const promptList = document.getElementById('promptList');
        if (!promptList) return;

        promptList.innerHTML = '';

        if (prompts.length === 0) {
            promptList.innerHTML = '<div class="empty-state">没有找到匹配的模板</div>';
            return;
        }

        prompts.forEach(prompt => {
            const promptItem = this.createPromptItem(prompt);
            promptList.appendChild(promptItem);
        });
    }

    /**
     * 加载会话消息到聊天界面
     */
    async loadSessionMessages(session) {
        if (!session) return;

        try {
            // 使用ChatService切换会话
            await this.chatService.switchToSession(session.id);
        } catch (error) {
            console.error('Failed to load session messages:', error);
            this.showNotification('加载会话消息失败', 'error');
        }
    }

    /**
     * 显示新建会话模态框
     */
    showNewSessionModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">新建会话</h3>
                    <button class="close-btn modal-close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">会话名称</label>
                        <input type="text" class="form-input" id="newSessionName" placeholder="请输入会话名称">
                    </div>
                    <div class="form-group">
                        <label class="form-label">会话描述</label>
                        <textarea class="form-textarea" id="newSessionDescription" placeholder="请输入会话描述（可选）"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel-btn">取消</button>
                    <button class="btn btn-primary modal-create-btn">创建</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
        
        // 设置事件监听器
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = modal.querySelector('.modal-cancel-btn');
        const createBtn = modal.querySelector('.modal-create-btn');
        
        closeBtn.addEventListener('click', () => this.closeModal(closeBtn));
        cancelBtn.addEventListener('click', () => this.closeModal(cancelBtn));
        createBtn.addEventListener('click', () => this.createNewSession(modal));
        
        // 聚焦到输入框
        modal.querySelector('#newSessionName').focus();
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
    }

    /**
     * 关闭模态框
     */
    closeModal(element) {
        const modal = element.closest('.modal-overlay');
        if (modal) {
            modal.remove();
        }
    }

  /**
     * 创建新会话
     */
    async createNewSession(modal) {
        try {
            const name = modal.querySelector('#newSessionName').value.trim();
            const description = modal.querySelector('#newSessionDescription').value.trim();

            if (!name) {
                alert('请输入会话名称');
                return;
            }

            const session = await this.sessionManager.createSession(name, description);
            await this.sessionManager.setCurrentSession(session.id);
            
            this.closeModal(modal);
            this.hideSessionPanel();
            this.showNotification('会话创建成功', 'success');
        } catch (error) {
            this.showNotification('创建会话失败', 'error');
            console.error('Failed to create session:', error);
        }
    }

    /**
     * 显示新建Prompt模态框
     */
    showNewPromptModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">新建Prompt模板</h3>
                    <button class="close-btn modal-close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">模板名称</label>
                        <input type="text" class="form-input" id="newPromptName" placeholder="请输入模板名称">
                    </div>
                    <div class="form-group">
                        <label class="form-label">分类</label>
                        <select class="form-select" id="newPromptCategory">
                            <option value="programming">编程</option>
                            <option value="content">内容创作</option>
                            <option value="analysis">数据分析</option>
                            <option value="language">语言</option>
                            <option value="other">其他</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <input type="text" class="form-input" id="newPromptDescription" placeholder="请输入模板描述">
                    </div>
                    <div class="form-group">
                        <label class="form-label">标签（用逗号分隔）</label>
                        <input type="text" class="form-input" id="newPromptTags" placeholder="标签1, 标签2, 标签3">
                    </div>
                    <div class="form-group">
                        <label class="form-label">模板内容</label>
                        <textarea class="form-textarea" id="newPromptTemplate" rows="10" placeholder="请输入模板内容，可以使用 {变量名} 作为占位符"></textarea>
                        <div class="form-help">使用 {变量名} 作为变量占位符，例如：{code}、{language} 等</div>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="newPromptAutoSelect" checked>
                            <span>启用智能匹配</span>
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel-btn">取消</button>
                    <button class="btn btn-primary modal-create-btn">创建</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
        
        // 设置事件监听器
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = modal.querySelector('.modal-cancel-btn');
        const createBtn = modal.querySelector('.modal-create-btn');
        
        closeBtn.addEventListener('click', () => this.closeModal(closeBtn));
        cancelBtn.addEventListener('click', () => this.closeModal(cancelBtn));
        createBtn.addEventListener('click', () => this.createNewPrompt(modal));
        
        // 聚焦到输入框
        modal.querySelector('#newPromptName').focus();
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
    }

    /**
     * 创建新Prompt
     */
    async createNewPrompt(modal) {
        try {
            const name = modal.querySelector('#newPromptName').value.trim();
            const category = modal.querySelector('#newPromptCategory').value;
            const description = modal.querySelector('#newPromptDescription').value.trim();
            const tags = modal.querySelector('#newPromptTags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
            const template = modal.querySelector('#newPromptTemplate').value.trim();
            const autoSelect = modal.querySelector('#newPromptAutoSelect').checked;

            if (!name || !template) {
                alert('请填写模板名称和内容');
                return;
            }

            const prompt = {
                name,
                category,
                description,
                tags,
                template,
                autoSelect,
                confidenceThreshold: 0.5,
                rating: 0,
                usageCount: 0
            };

            await this.promptManager.createPrompt(prompt);
            this.closeModal(modal);
            this.hidePromptPanel();
            this.showNotification('Prompt模板创建成功', 'success');
        } catch (error) {
            this.showNotification('创建Prompt模板失败', 'error');
            console.error('Failed to create prompt:', error);
        }
    }

    /**
     * 显示通知
     */
    showNotification(message, type = 'info') {
        if (window.uiController && window.uiController.showNotification) {
            window.uiController.showNotification(message, type);
        } else {
            // 简单的通知实现
            const notification = document.createElement('div');
            notification.className = `notification notification-${type}`;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                background: ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#3b82f6'};
                color: white;
                border-radius: 8px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            notification.textContent = message;
            
            document.body.appendChild(notification);
            
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        }
    }

    /**
     * 显示导入会话模态框
     */
    showImportSessionModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">导入会话</h3>
                    <button class="close-btn modal-close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">选择导入方式</label>
                        <div class="import-methods">
                            <button class="import-method-btn active" data-method="file">
                                📁 从文件导入
                            </button>
                            <button class="import-method-btn" data-method="text">
                                📝 从文本导入
                            </button>
                        </div>
                    </div>
                    
                    <div id="fileImportSection" class="import-section">
                        <div class="form-group">
                            <label class="form-label">选择文件</label>
                            <input type="file" id="importSessionFile" accept=".json,.md,.txt" class="file-input">
                            <div class="form-help">支持JSON、Markdown、纯文本格式</div>
                        </div>
                    </div>
                    
                    <div id="textImportSection" class="import-section hidden">
                        <div class="form-group">
                            <label class="form-label">粘贴内容</label>
                            <textarea id="importSessionText" class="form-textarea" rows="10" placeholder="粘贴会话内容..."></textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">会话名称</label>
                            <input type="text" id="importSessionName" class="form-input" placeholder="输入会话名称">
                        </div>
                    </div>
                    
                    <div id="importPreviewSection" class="import-section hidden">
                        <div class="form-group">
                            <label class="form-label">导入预览</label>
                            <div id="importPreview" class="import-preview">
                                <!-- 预览内容 -->
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel-btn">取消</button>
                    <button id="previewImportBtn" class="btn btn-secondary">预览</button>
                    <button id="confirmImportBtn" class="btn btn-primary" disabled>确认导入</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
        
        // 设置事件监听器
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = modal.querySelector('.modal-cancel-btn');
        
        closeBtn.addEventListener('click', () => this.closeModal(closeBtn));
        cancelBtn.addEventListener('click', () => this.closeModal(cancelBtn));
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
        
        this.setupImportModalHandlers(modal);
    }

    /**
     * 设置导入模态框处理器
     */
    setupImportModalHandlers(modal) {
        let importData = null;
        
        // 导入方式切换
        modal.querySelectorAll('.import-method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                modal.querySelectorAll('.import-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const method = btn.dataset.method;
                modal.querySelectorAll('.import-section').forEach(section => {
                    section.classList.add('hidden');
                });
                
                if (method === 'file') {
                    document.getElementById('fileImportSection').classList.remove('hidden');
                } else {
                    document.getElementById('textImportSection').classList.remove('hidden');
                }
                
                // 重置预览
                document.getElementById('importPreviewSection').classList.add('hidden');
                document.getElementById('confirmImportBtn').disabled = true;
            });
        });
        
        // 文件选择处理
        document.getElementById('importSessionFile')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const content = await this.readFileAsText(file);
                    importData = await this.parseImportContent(content, file.name);
                    this.showImportPreview(importData, modal);
                } catch (error) {
                    this.showNotification('文件解析失败: ' + error.message, 'error');
                }
            }
        });
        
        // 预览按钮
        document.getElementById('previewImportBtn')?.addEventListener('click', async () => {
            try {
                const text = document.getElementById('importSessionText').value;
                const name = document.getElementById('importSessionName').value;
                
                if (!text.trim()) {
                    this.showNotification('请输入导入内容', 'error');
                    return;
                }
                
                importData = await this.parseImportContent(text, name + '.txt', name);
                this.showImportPreview(importData, modal);
            } catch (error) {
                this.showNotification('内容解析失败: ' + error.message, 'error');
            }
        });
        
        // 确认导入按钮
        document.getElementById('confirmImportBtn')?.addEventListener('click', async () => {
            if (importData) {
                try {
                    await this.performImport(importData);
                    this.closeModal(modal);
                    this.hideSessionPanel();
                    this.showNotification('会话导入成功', 'success');
                } catch (error) {
                    this.showNotification('导入失败: ' + error.message, 'error');
                }
            }
        });
    }

    /**
     * 读取文件为文本
     */
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }

    /**
     * 解析导入内容
     */
    async parseImportContent(content, fileName, suggestedName = '') {
        const extension = fileName.split('.').pop().toLowerCase();
        
        switch (extension) {
            case 'json':
                return this.parseJSONImport(content, suggestedName);
            case 'md':
                return this.parseMarkdownImport(content, suggestedName);
            case 'txt':
                return this.parseTextImport(content, suggestedName);
            default:
                throw new Error('不支持的文件格式');
        }
    }

    /**
     * 解析JSON导入
     */
    parseJSONImport(content, suggestedName) {
        try {
            const data = JSON.parse(content);
            
            if (!data.session || !data.messages) {
                throw new Error('JSON格式不正确');
            }
            
            return {
                name: suggestedName || data.session.name || '导入的会话',
                description: data.session.description || '',
                messages: data.messages || [],
                metadata: data.session.metadata || {},
                originalData: data
            };
        } catch (error) {
            throw new Error('JSON解析失败: ' + error.message);
        }
    }

    /**
     * 解析Markdown导入
     */
    parseMarkdownImport(content, suggestedName) {
        const lines = content.split('\n');
        let name = suggestedName || '导入的会话';
        let description = '';
        let messages = [];
        let currentMessage = null;
        let inMessages = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.startsWith('# ')) {
                name = line.substring(2).trim();
            } else if (line.startsWith('**描述:**')) {
                description = line.substring('**描述:**'.length).trim();
            } else if (line.startsWith('---') && i > 0) {
                inMessages = true;
            } else if (inMessages && line.startsWith('### ')) {
                if (currentMessage) {
                    messages.push(currentMessage);
                }
                currentMessage = {
                    role: line.includes('用户') ? 'user' : 'assistant',
                    content: '',
                    timestamp: new Date().toISOString()
                };
            } else if (inMessages && currentMessage && !line.startsWith('**时间:**')) {
                currentMessage.content += (currentMessage.content ? '\n' : '') + line;
            }
        }
        
        if (currentMessage) {
            messages.push(currentMessage);
        }
        
        return {
            name,
            description,
            messages,
            metadata: {}
        };
    }

    /**
     * 解析文本导入
     */
    parseTextImport(content, suggestedName) {
        const lines = content.split('\n');
        let name = suggestedName || '导入的会话';
        let description = '';
        let messages = [];
        let currentMessage = null;
        
        for (const line of lines) {
            if (line.startsWith('描述:')) {
                description = line.substring('描述:'.length).trim();
            } else if (line.includes('. 用户 (') || line.includes('. 助手 (')) {
                if (currentMessage && currentMessage.content.trim()) {
                    messages.push(currentMessage);
                }
                currentMessage = {
                    role: line.includes('用户') ? 'user' : 'assistant',
                    content: '',
                    timestamp: new Date().toISOString()
                };
            } else if (currentMessage && !line.startsWith('---')) {
                currentMessage.content += (currentMessage.content ? '\n' : '') + line;
            }
        }
        
        if (currentMessage && currentMessage.content.trim()) {
            messages.push(currentMessage);
        }
        
        return {
            name,
            description,
            messages,
            metadata: {}
        };
    }

    /**
     * 显示导入预览
     */
    showImportPreview(importData, modal) {
        const previewSection = document.getElementById('importPreviewSection');
        const preview = document.getElementById('importPreview');
        const confirmBtn = document.getElementById('confirmImportBtn');
        
        preview.innerHTML = `
            <div class="preview-header">
                <h4>${this.escapeHtml(importData.name)}</h4>
                <p>${this.escapeHtml(importData.description)}</p>
            </div>
            <div class="preview-stats">
                <span>📝 ${importData.messages.length} 条消息</span>
            </div>
            <div class="preview-messages">
                ${importData.messages.slice(0, 3).map(msg => `
                    <div class="preview-message">
                        <div class="preview-message-role">${msg.role === 'user' ? '用户' : '助手'}</div>
                        <div class="preview-message-content">${this.escapeHtml(msg.content.substring(0, 100))}${msg.content.length > 100 ? '...' : ''}</div>
                    </div>
                `).join('')}
                ${importData.messages.length > 3 ? `<div class="preview-more">还有 ${importData.messages.length - 3} 条消息...</div>` : ''}
            </div>
        `;
        
        previewSection.classList.remove('hidden');
        confirmBtn.disabled = false;
        confirmBtn.dataset.importData = JSON.stringify(importData);
    }

    /**
     * 执行导入
     */
    async performImport(importData) {
        // 创建新会话
        const session = await this.sessionManager.createSession(
            importData.name,
            importData.description
        );
        
        // 导入消息
        for (const message of importData.messages) {
            await this.sessionManager.addMessage(
                session.id,
                message.role,
                message.content,
                message.timestamp
            );
        }
        
        // 更新会话元数据
        if (importData.metadata) {
            await this.sessionManager.updateSession(session.id, {
                metadata: importData.metadata
            });
        }
        
        // 切换到新会话
        await this.sessionManager.setCurrentSession(session.id);
        
        return session;
    }

    /**
     * HTML转义
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 高亮搜索关键词
     */
    highlightText(text, query) {
        if (!query || !text) return this.escapeHtml(text);
        
        const escapedText = this.escapeHtml(text);
        const escapedQuery = this.escapeHtml(query);
        const regex = new RegExp(`(${escapedQuery})`, 'gi');
        
        return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
    }

    /**
     * 判断是否为内置Prompt
     */
    isBuiltinPrompt(prompt) {
        return this.promptManager.builtinPrompts && 
               this.promptManager.builtinPrompts.some(bp => bp.id === prompt.id);
    }

    /**
     * 编辑Prompt
     */
    async editPrompt(promptId) {
        try {
            const prompt = this.promptManager.getPrompt(promptId);
            if (!prompt) return;

            this.showPromptEditModal(prompt);
        } catch (error) {
            this.showNotification('编辑Prompt失败', 'error');
            console.error('Failed to edit prompt:', error);
        }
    }

    /**
     * 删除Prompt
     */
    async deletePrompt(promptId) {
        try {
            const prompt = this.promptManager.getPrompt(promptId);
            if (!prompt) return;

            if (confirm(`确定要删除Prompt"${prompt.name}"吗？`)) {
                await this.promptManager.deletePrompt(promptId);
                this.renderPrompts();
                this.showNotification('Prompt删除成功', 'success');
            }
        } catch (error) {
            this.showNotification('删除Prompt失败', 'error');
            console.error('Failed to delete prompt:', error);
        }
    }

    /**
     * 显示Prompt编辑模态框
     */
    showPromptEditModal(prompt) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">编辑Prompt - ${this.escapeHtml(prompt.name)}</h3>
                    <button class="close-btn modal-close-btn">×</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">名称</label>
                        <input type="text" class="form-input" id="edit_prompt_name" value="${this.escapeHtml(prompt.name)}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">描述</label>
                        <textarea class="form-textarea" id="edit_prompt_description" rows="2">${this.escapeHtml(prompt.description)}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="form-label">分类</label>
                        <input type="text" class="form-input" id="edit_prompt_category" value="${this.escapeHtml(prompt.category)}" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">标签（用逗号分隔）</label>
                        <input type="text" class="form-input" id="edit_prompt_tags" value="${(prompt.tags || []).join(', ')}">
                    </div>
                    <div class="form-group">
                        <label class="form-label">模板</label>
                        <textarea class="form-textarea" id="edit_prompt_template" rows="10" required>${this.escapeHtml(prompt.template)}</textarea>
                    </div>
                    <div class="form-group">
                        <label class="checkbox-label">
                            <input type="checkbox" id="edit_prompt_auto_select" ${prompt.autoSelect ? 'checked' : ''}>
                            <span>自动选择</span>
                        </label>
                    </div>
                    <div class="form-group">
                        <label class="form-label">置信度阈值 (0-1)</label>
                        <input type="number" class="form-input" id="edit_prompt_confidence_threshold" value="${prompt.confidenceThreshold || 0.5}" min="0" max="1" step="0.1">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel-btn">取消</button>
                    <button class="btn btn-primary modal-save-btn">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
        
        // 设置事件监听器
        const closeBtn = modal.querySelector('.modal-close-btn');
        const cancelBtn = modal.querySelector('.modal-cancel-btn');
        const saveBtn = modal.querySelector('.modal-save-btn');
        
        closeBtn.addEventListener('click', () => this.closeModal(closeBtn));
        cancelBtn.addEventListener('click', () => this.closeModal(cancelBtn));
        saveBtn.addEventListener('click', () => this.savePromptEdit(prompt.id, modal));
        
        // 点击模态框外部关闭
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal(modal);
            }
        });
    }

    /**
     * 保存Prompt编辑
     */
    async savePromptEdit(promptId, modal) {
        try {
            const name = document.getElementById('edit_prompt_name').value.trim();
            const description = document.getElementById('edit_prompt_description').value.trim();
            const category = document.getElementById('edit_prompt_category').value.trim();
            const tags = document.getElementById('edit_prompt_tags').value.split(',').map(tag => tag.trim()).filter(tag => tag);
            const template = document.getElementById('edit_prompt_template').value.trim();
            const autoSelect = document.getElementById('edit_prompt_auto_select').checked;
            const confidenceThreshold = parseFloat(document.getElementById('edit_prompt_confidence_threshold').value);

            if (!name || !category || !template) {
                this.showNotification('请填写必填字段', 'error');
                return;
            }

            const updates = {
                name,
                description,
                category,
                tags,
                template,
                autoSelect,
                confidenceThreshold
            };

            await this.promptManager.updatePrompt(promptId, updates);
            this.renderPrompts();
            this.closeModal(modal);
            this.showNotification('Prompt更新成功', 'success');
        } catch (error) {
            this.showNotification('保存Prompt失败', 'error');
            console.error('Failed to save prompt edit:', error);
        }
    }
}

// 导出UIComponentManager类
window.UIComponentManager = UIComponentManager;