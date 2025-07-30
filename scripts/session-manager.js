/**
 * 会话管理器
 * 管理会话的创建、更新、删除和切换
 */
class SessionManager {
    constructor(dbManager) {
        this.dbManager = dbManager;
        this.currentSessionId = null;
        this.sessions = [];
        this.initialized = false;
        this.listeners = new Map(); // 事件监听器
        
        // 性能优化配置
        this.messageBatchSize = 50; // 每批加载的消息数量
        this.messageCache = new Map(); // 消息缓存
        this.loadingMessages = new Set(); // 正在加载的消息会话ID
        this.loadedMessageCounts = new Map(); // 已加载的消息数量
    }

    /**
     * 初始化会话管理器
     */
    async init() {
        if (this.initialized) {
            return;
        }

        try {
            await this.dbManager.init();
            await this.loadSessions();
            await this.restoreCurrentSession();
            this.initialized = true;
            console.log('SessionManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize SessionManager:', error);
            throw error;
        }
    }

    /**
     * 加载所有会话
     */
    async loadSessions() {
        try {
            this.sessions = await this.dbManager.getAllSessions();
            console.log(`Loaded ${this.sessions.length} sessions`);
        } catch (error) {
            console.error('Failed to load sessions:', error);
            throw error;
        }
    }

    /**
     * 恢复当前会话
     */
    async restoreCurrentSession() {
        try {
            const currentSessionId = await this.dbManager.getMetadata('current_session_id');
            if (currentSessionId && this.sessions.find(s => s.id === currentSessionId)) {
                this.currentSessionId = currentSessionId;
                console.log(`Restored current session: ${currentSessionId}`);
            } else if (this.sessions.length > 0) {
                // 如果没有当前会话，使用最新的会话
                const latestSession = this.sessions.reduce((latest, session) => 
                    new Date(session.updatedAt) > new Date(latest.updatedAt) ? session : latest
                );
                this.currentSessionId = latestSession.id;
                await this.setCurrentSession(latestSession.id);
                console.log(`Set current session to latest: ${latestSession.id}`);
            } else {
                // 如果没有会话，创建默认会话
                const defaultSession = await this.createSession('默认会话', '新创建的默认会话');
                this.currentSessionId = defaultSession.id;
                console.log(`Created default session: ${defaultSession.id}`);
            }
        } catch (error) {
            console.error('Failed to restore current session:', error);
            throw error;
        }
    }

    /**
     * 创建新会话
     */
    async createSession(name, description = '', metadata = {}) {
        try {
            const session = {
                id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name,
                description,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: [],
                metadata: {
                    messageCount: 0,
                    totalTokens: 0,
                    tags: [],
                    ...metadata
                }
            };

            await this.dbManager.saveSession(session);
            this.sessions.push(session);
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(session);
            
            // 触发事件
            this.emit('sessionCreated', session);
            
            console.log(`Created session: ${session.id}`);
            return session;
        } catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    }

    /**
     * 更新会话
     */
    async updateSession(sessionId, updates) {
        try {
            const sessionIndex = this.sessions.findIndex(s => s.id === sessionId);
            if (sessionIndex === -1) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            const session = this.sessions[sessionIndex];
            const updatedSession = {
                ...session,
                ...updates,
                updatedAt: new Date().toISOString(),
                metadata: {
                    ...session.metadata,
                    ...updates.metadata
                }
            };

            await this.dbManager.saveSession(updatedSession);
            this.sessions[sessionIndex] = updatedSession;
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(updatedSession);
            
            // 触发事件
            this.emit('sessionUpdated', updatedSession);
            
            console.log(`Updated session: ${sessionId}`);
            return updatedSession;
        } catch (error) {
            console.error('Failed to update session:', error);
            throw error;
        }
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId) {
        try {
            const sessionIndex = this.sessions.findIndex(s => s.id === sessionId);
            if (sessionIndex === -1) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            const session = this.sessions[sessionIndex];
            await this.dbManager.deleteSession(sessionId);
            this.sessions.splice(sessionIndex, 1);
            
            // 如果删除的是当前会话，切换到其他会话
            if (this.currentSessionId === sessionId) {
                if (this.sessions.length > 0) {
                    await this.setCurrentSession(this.sessions[0].id);
                } else {
                    // 如果没有会话了，创建新的默认会话
                    const newSession = await this.createSession('默认会话', '新创建的默认会话');
                    await this.setCurrentSession(newSession.id);
                }
            }
            
            // 触发事件
            this.emit('sessionDeleted', session);
            
            console.log(`Deleted session: ${sessionId}`);
        } catch (error) {
            console.error('Failed to delete session:', error);
            throw error;
        }
    }

    /**
     * 设置当前会话
     */
    async setCurrentSession(sessionId) {
        try {
            const session = this.sessions.find(s => s.id === sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            this.currentSessionId = sessionId;
            await this.dbManager.saveMetadata('current_session_id', sessionId);
            
            // 触发事件
            this.emit('currentSessionChanged', session);
            
            console.log(`Set current session: ${sessionId}`);
        } catch (error) {
            console.error('Failed to set current session:', error);
            throw error;
        }
    }

    /**
     * 获取当前会话
     */
    getCurrentSession() {
        return this.sessions.find(s => s.id === this.currentSessionId);
    }

    /**
     * 获取会话
     */
    getSession(sessionId) {
        return this.sessions.find(s => s.id === sessionId);
    }

    /**
     * 获取会话消息（支持懒加载）
     */
    async getSessionMessages(sessionId, options = {}) {
        const { 
            limit = this.messageBatchSize, 
            offset = 0, 
            forceReload = false 
        } = options;
        
        const session = this.getSession(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }

        // 如果强制重新加载或消息未加载，从数据库加载
        if (forceReload || !session.messages || session.messages.length === 0) {
            await this.loadSessionMessages(sessionId);
            return session.messages || [];
        }

        // 如果已经缓存了所有消息，直接返回
        const totalMessages = session.metadata?.messageCount || session.messages.length;
        if (session.messages.length >= totalMessages) {
            return session.messages.slice(offset, offset + limit);
        }

        // 否则加载更多消息
        return await this.loadMoreMessages(sessionId, offset, limit);
    }

    /**
     * 加载会话消息
     */
    async loadSessionMessages(sessionId) {
        if (this.loadingMessages.has(sessionId)) {
            return; // 避免重复加载
        }

        this.loadingMessages.add(sessionId);
        
        try {
            const session = this.getSession(sessionId);
            if (!session) return;

            // 从数据库加载消息
            const messages = await this.dbManager.getSessionMessages(sessionId);
            
            // 缓存消息
            session.messages = messages || [];
            this.messageCache.set(sessionId, messages);
            this.loadedMessageCounts.set(sessionId, messages.length);
            
            // 更新消息计数
            if (session.metadata) {
                session.metadata.messageCount = messages.length;
            }
            
            console.log(`Loaded ${messages.length} messages for session: ${sessionId}`);
        } catch (error) {
            console.error(`Failed to load messages for session ${sessionId}:`, error);
        } finally {
            this.loadingMessages.delete(sessionId);
        }
    }

    /**
     * 加载更多消息
     */
    async loadMoreMessages(sessionId, offset, limit) {
        const session = this.getSession(sessionId);
        if (!session) return [];

        // 如果已经缓存了所有消息，直接返回切片
        const cachedMessages = this.messageCache.get(sessionId) || [];
        if (cachedMessages.length > 0) {
            return cachedMessages.slice(offset, offset + limit);
        }

        // 否则从数据库加载
        try {
            const messages = await this.dbManager.getSessionMessages(sessionId, { offset, limit });
            return messages || [];
        } catch (error) {
            console.error(`Failed to load more messages for session ${sessionId}:`, error);
            return [];
        }
    }

    /**
     * 预加载会话消息
     */
    async preloadSessionMessages(sessionId) {
        const session = this.getSession(sessionId);
        if (!session || this.loadingMessages.has(sessionId)) {
            return;
        }

        // 如果消息已经缓存，跳过
        if (this.messageCache.has(sessionId)) {
            return;
        }

        // 延迟加载，避免阻塞主线程
        setTimeout(() => {
            this.loadSessionMessages(sessionId);
        }, 100);
    }

    /**
     * 清理消息缓存
     */
    clearMessageCache(sessionId = null) {
        if (sessionId) {
            this.messageCache.delete(sessionId);
            this.loadedMessageCounts.delete(sessionId);
        } else {
            this.messageCache.clear();
            this.loadedMessageCounts.clear();
        }
    }

    /**
     * 获取所有会话
     */
    getAllSessions() {
        return [...this.sessions];
    }

    /**
     * 向会话添加消息
     */
    async addMessage(sessionId, role, content) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            const message = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                role,
                content,
                timestamp: new Date().toISOString()
            };

            session.messages.push(message);
            session.metadata.messageCount = session.messages.length;
            session.metadata.totalTokens = this.calculateTotalTokens(session.messages);
            session.updatedAt = new Date().toISOString();

            await this.dbManager.saveSession(session);
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(session);
            
            // 触发事件
            this.emit('messageAdded', { session, message });
            
            return message;
        } catch (error) {
            console.error('Failed to add message:', error);
            throw error;
        }
    }

    /**
     * 更新会话消息
     */
    async updateMessage(sessionId, messageId, updates) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            const messageIndex = session.messages.findIndex(m => m.id === messageId);
            if (messageIndex === -1) {
                throw new Error(`Message not found: ${messageId}`);
            }

            const message = session.messages[messageIndex];
            const updatedMessage = {
                ...message,
                ...updates
            };

            session.messages[messageIndex] = updatedMessage;
            session.metadata.totalTokens = this.calculateTotalTokens(session.messages);
            session.updatedAt = new Date().toISOString();

            await this.dbManager.saveSession(session);
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(session);
            
            // 触发事件
            this.emit('messageUpdated', { session, message: updatedMessage });
            
            return updatedMessage;
        } catch (error) {
            console.error('Failed to update message:', error);
            throw error;
        }
    }

    /**
     * 删除会话消息
     */
    async deleteMessage(sessionId, messageId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            const messageIndex = session.messages.findIndex(m => m.id === messageId);
            if (messageIndex === -1) {
                throw new Error(`Message not found: ${messageId}`);
            }

            const message = session.messages[messageIndex];
            session.messages.splice(messageIndex, 1);
            session.metadata.messageCount = session.messages.length;
            session.metadata.totalTokens = this.calculateTotalTokens(session.messages);
            session.updatedAt = new Date().toISOString();

            await this.dbManager.saveSession(session);
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(session);
            
            // 触发事件
            this.emit('messageDeleted', { session, message });
            
        } catch (error) {
            console.error('Failed to delete message:', error);
            throw error;
        }
    }

    /**
     * 清空会话消息
     */
    async clearMessages(sessionId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            session.messages = [];
            session.metadata.messageCount = 0;
            session.metadata.totalTokens = 0;
            session.updatedAt = new Date().toISOString();

            await this.dbManager.saveSession(session);
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(session);
            
            // 触发事件
            this.emit('messagesCleared', session);
            
        } catch (error) {
            console.error('Failed to clear messages:', error);
            throw error;
        }
    }

    /**
     * 搜索会话
     */
    async searchSessions(query, options = {}) {
        try {
            const results = await this.dbManager.searchSessions(query, options);
            return results;
        } catch (error) {
            console.error('Failed to search sessions:', error);
            throw error;
        }
    }

    /**
     * 获取会话统计信息
     */
    getSessionStats() {
        const stats = {
            totalSessions: this.sessions.length,
            totalMessages: this.sessions.reduce((sum, session) => sum + session.messages.length, 0),
            totalTokens: this.sessions.reduce((sum, session) => sum + (session.metadata.totalTokens || 0), 0),
            currentSession: this.currentSessionId
        };

        return stats;
    }

    /**
     * 计算消息总token数
     */
    calculateTotalTokens(messages) {
        return messages.reduce((total, msg) => {
            return total + Math.ceil(msg.content.length / 4);
        }, 0);
    }

    /**
     * 更新会话搜索索引
     */
    async updateSessionSearchIndex(session) {
        try {
            const content = [
                session.name,
                session.description,
                ...session.messages.map(msg => msg.content)
            ].join(' ');
            
            await this.dbManager.updateSearchIndex('session', session.id, content);
        } catch (error) {
            console.error('Failed to update session search index:', error);
        }
    }

    /**
     * 事件监听器管理
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Event listener error for ${event}:`, error);
                }
            });
        }
    }

    /**
     * 销毁会话管理器
     */
    async destroy() {
        try {
            this.listeners.clear();
            this.sessions = [];
            this.currentSessionId = null;
            this.initialized = false;
            console.log('SessionManager destroyed');
        } catch (error) {
            console.error('Failed to destroy SessionManager:', error);
            throw error;
        }
    }
}

// 导出SessionManager类
window.SessionManager = SessionManager;