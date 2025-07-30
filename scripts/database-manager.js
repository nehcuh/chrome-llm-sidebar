/**
 * IndexedDB 数据库管理器
 * 管理会话和Prompt数据的存储、检索和同步
 */
class DatabaseManager {
    constructor() {
        this.db = null;
        this.dbName = 'AICopilotDB';
        this.dbVersion = 1;
        this.initPromise = null;
        this.isInitialized = false;
    }

    /**
     * 初始化数据库
     */
    async init() {
        if (this.isInitialized) {
            return this.db;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error('Database error:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.isInitialized = true;
                console.log('Database initialized successfully');
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                this.createSchema(db);
            };
        });

        return this.initPromise;
    }

    /**
     * 创建数据库架构
     */
    createSchema(db) {
        // 会话存储
        if (!db.objectStoreNames.contains('sessions')) {
            const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' });
            sessionStore.createIndex('name', 'name', { unique: false });
            sessionStore.createIndex('createdAt', 'createdAt', { unique: false });
            sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
            sessionStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            sessionStore.createIndex('messageCount', 'messageCount', { unique: false });
        }

        // Prompt存储
        if (!db.objectStoreNames.contains('prompts')) {
            const promptStore = db.createObjectStore('prompts', { keyPath: 'id' });
            promptStore.createIndex('name', 'name', { unique: false });
            promptStore.createIndex('category', 'category', { unique: false });
            promptStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            promptStore.createIndex('autoSelect', 'autoSelect', { unique: false });
            promptStore.createIndex('usageCount', 'usageCount', { unique: false });
            promptStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 搜索索引存储
        if (!db.objectStoreNames.contains('search_index')) {
            const searchStore = db.createObjectStore('search_index', { keyPath: 'id' });
            searchStore.createIndex('type', 'type', { unique: false });
            searchStore.createIndex('targetId', 'targetId', { unique: false });
            searchStore.createIndex('content', 'content', { unique: false });
        }

        // 元数据存储
        if (!db.objectStoreNames.contains('metadata')) {
            const metadataStore = db.createObjectStore('metadata', { keyPath: 'key' });
            metadataStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        console.log('Database schema created');
    }

    /**
     * 获取数据库实例
     */
    async getDB() {
        if (!this.isInitialized) {
            await this.init();
        }
        return this.db;
    }

    /**
     * 开始事务
     */
    async beginTransaction(storeNames, mode = 'readonly') {
        const db = await this.getDB();
        return db.transaction(storeNames, mode);
    }

    // ========== 会话管理 ==========

    /**
     * 创建或更新会话
     */
    async saveSession(session) {
        const transaction = await this.beginTransaction(['sessions'], 'readwrite');
        const store = transaction.objectStore('sessions');
        
        // 确保时间戳
        const now = new Date().toISOString();
        if (!session.createdAt) {
            session.createdAt = now;
        }
        session.updatedAt = now;

        return new Promise((resolve, reject) => {
            const request = store.put(session);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取会话
     */
    async getSession(sessionId) {
        const transaction = await this.beginTransaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.get(sessionId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取会话消息（支持分页）
     */
    async getSessionMessages(sessionId, options = {}) {
        const { offset = 0, limit = 50 } = options;
        
        try {
            // 首先获取会话，然后返回其消息
            const session = await this.getSession(sessionId);
            if (!session || !session.messages) {
                return [];
            }
            
            // 应用分页
            return session.messages.slice(offset, offset + limit);
        } catch (error) {
            console.error(`Failed to get messages for session ${sessionId}:`, error);
            return [];
        }
    }

    /**
     * 获取所有会话
     */
    async getAllSessions() {
        const transaction = await this.beginTransaction(['sessions'], 'readonly');
        const store = transaction.objectStore('sessions');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除会话
     */
    async deleteSession(sessionId) {
        const transaction = await this.beginTransaction(['sessions', 'search_index'], 'readwrite');
        const sessionStore = transaction.objectStore('sessions');
        const searchStore = transaction.objectStore('search_index');
        
        // 删除会话
        await new Promise((resolve, reject) => {
            const request = sessionStore.delete(sessionId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        // 删除相关搜索索引
        const searchIndex = await searchStore.index('targetId').getAll(sessionId);
        for (const item of searchIndex) {
            await new Promise((resolve, reject) => {
                const request = searchStore.delete(item.id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * 搜索会话
     */
    async searchSessions(query, options = {}) {
        const { 
            limit = 50, 
            offset = 0, 
            sortBy = 'updatedAt', 
            sortOrder = 'desc',
            startDate,
            endDate,
            tags
        } = options;
        
        let filteredSessions = [];
        
        if (query && query.trim()) {
            // 使用搜索索引进行全文搜索
            const searchResults = await this.searchInIndex('session', query);
            const sessionIds = searchResults.map(item => item.targetId);
            
            if (sessionIds.length === 0) {
                return [];
            }
            
            // 获取会话详情
            const sessions = await this.getAllSessions();
            filteredSessions = sessions.filter(session => sessionIds.includes(session.id));
        } else {
            // 无查询时获取所有会话
            filteredSessions = await this.getAllSessions();
        }
        
        // 时间范围过滤
        if (startDate) {
            const start = new Date(startDate);
            filteredSessions = filteredSessions.filter(session => 
                new Date(session.updatedAt) >= start
            );
        }
        
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999); // 包含当天
            filteredSessions = filteredSessions.filter(session => 
                new Date(session.updatedAt) <= end
            );
        }
        
        // 标签过滤
        if (tags && tags.length > 0) {
            filteredSessions = filteredSessions.filter(session => {
                const sessionTags = session.metadata?.tags || [];
                return tags.some(tag => sessionTags.includes(tag));
            });
        }
        
        // 排序
        filteredSessions.sort((a, b) => {
            const aVal = a[sortBy];
            const bVal = b[sortBy];
            const order = sortOrder === 'desc' ? -1 : 1;
            return aVal > bVal ? order : aVal < bVal ? -order : 0;
        });

        return filteredSessions.slice(offset, offset + limit);
    }

    // ========== Prompt管理 ==========

    /**
     * 创建或更新Prompt
     */
    async savePrompt(prompt) {
        const transaction = await this.beginTransaction(['prompts'], 'readwrite');
        const store = transaction.objectStore('prompts');
        
        // 确保时间戳
        const now = new Date().toISOString();
        if (!prompt.createdAt) {
            prompt.createdAt = now;
        }
        prompt.updatedAt = now;

        return new Promise((resolve, reject) => {
            const request = store.put(prompt);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取Prompt
     */
    async getPrompt(promptId) {
        const transaction = await this.beginTransaction(['prompts'], 'readonly');
        const store = transaction.objectStore('prompts');
        
        return new Promise((resolve, reject) => {
            const request = store.get(promptId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有Prompt
     */
    async getAllPrompts() {
        const transaction = await this.beginTransaction(['prompts'], 'readonly');
        const store = transaction.objectStore('prompts');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取可自动选择的Prompt
     */
    async getAutoSelectPrompts() {
        const transaction = await this.beginTransaction(['prompts'], 'readonly');
        const store = transaction.objectStore('prompts');
        const index = store.index('autoSelect');
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(true);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 按分类获取Prompt
     */
    async getPromptsByCategory(category) {
        const transaction = await this.beginTransaction(['prompts'], 'readonly');
        const store = transaction.objectStore('prompts');
        const index = store.index('category');
        
        return new Promise((resolve, reject) => {
            const request = index.getAll(category);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 删除Prompt
     */
    async deletePrompt(promptId) {
        const transaction = await this.beginTransaction(['prompts', 'search_index'], 'readwrite');
        const promptStore = transaction.objectStore('prompts');
        const searchStore = transaction.objectStore('search_index');
        
        // 删除Prompt
        await new Promise((resolve, reject) => {
            const request = promptStore.delete(promptId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });

        // 删除相关搜索索引
        const searchIndex = await searchStore.index('targetId').getAll(promptId);
        for (const item of searchIndex) {
            await new Promise((resolve, reject) => {
                const request = searchStore.delete(item.id);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * 搜索Prompt
     */
    async searchPrompts(query, options = {}) {
        const { limit = 50, offset = 0, category, tags } = options;
        
        // 使用搜索索引进行全文搜索
        const searchResults = await this.searchInIndex('prompt', query);
        const promptIds = searchResults.map(item => item.targetId);
        
        if (promptIds.length === 0) {
            return [];
        }

        // 获取Prompt详情
        const prompts = await this.getAllPrompts();
        let filteredPrompts = prompts.filter(prompt => promptIds.includes(prompt.id));
        
        // 按分类过滤
        if (category) {
            filteredPrompts = filteredPrompts.filter(prompt => prompt.category === category);
        }
        
        // 按标签过滤
        if (tags && tags.length > 0) {
            filteredPrompts = filteredPrompts.filter(prompt => 
                prompt.tags && prompt.tags.some(tag => tags.includes(tag))
            );
        }

        return filteredPrompts.slice(offset, offset + limit);
    }

    // ========== 搜索索引管理 ==========

    /**
     * 更新搜索索引
     */
    async updateSearchIndex(type, targetId, content) {
        const transaction = await this.beginTransaction(['search_index'], 'readwrite');
        const store = transaction.objectStore('search_index');
        
        // 删除旧索引
        try {
            const oldIndex = await new Promise((resolve, reject) => {
                const request = store.index('targetId').getAll(targetId);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            for (const item of oldIndex) {
                await new Promise((resolve, reject) => {
                    const request = store.delete(item.id);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }
        } catch (error) {
            console.warn('Failed to delete old search index:', error);
        }

        // 创建新索引
        const indexItems = this.createIndexItems(type, targetId, content);
        for (const item of indexItems) {
            await new Promise((resolve, reject) => {
                const request = store.put(item);
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * 创建搜索索引项
     */
    createIndexItems(type, targetId, content) {
        const items = [];
        const keywords = this.extractKeywords(content);
        
        keywords.forEach((keyword, index) => {
            items.push({
                id: `${type}_${targetId}_${index}`,
                type,
                targetId,
                content: keyword.toLowerCase()
            });
        });

        return items;
    }

    /**
     * 提取关键词
     */
    extractKeywords(content) {
        if (!content) return [];
        
        // 移除HTML标签和特殊字符
        const text = content.replace(/<[^>]*>/g, '').replace(/[^\w\s\u4e00-\u9fff]/g, ' ');
        
        // 分词（简单的空格分词，支持中英文）
        const words = text.split(/\s+/).filter(word => word.length > 1);
        
        // 去重
        const uniqueWords = [...new Set(words)];
        
        return uniqueWords;
    }

    /**
     * 在索引中搜索
     */
    async searchInIndex(type, query) {
        const transaction = await this.beginTransaction(['search_index'], 'readonly');
        const store = transaction.objectStore('search_index');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => {
                const allItems = request.result;
                const queryLower = query.toLowerCase();
                
                // 过滤匹配的项
                const matchedItems = allItems.filter(item => {
                    if (type && item.type !== type) return false;
                    return item.content.includes(queryLower);
                });

                // 按targetId分组并计算相关性
                const groupedResults = {};
                matchedItems.forEach(item => {
                    if (!groupedResults[item.targetId]) {
                        groupedResults[item.targetId] = {
                            targetId: item.targetId,
                            score: 0,
                            item
                        };
                    }
                    groupedResults[item.targetId].score++;
                });

                // 按相关性排序
                const results = Object.values(groupedResults)
                    .sort((a, b) => b.score - a.score)
                    .map(result => result.item);

                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ========== 元数据管理 ==========

    /**
     * 保存元数据
     */
    async saveMetadata(key, value) {
        const transaction = await this.beginTransaction(['metadata'], 'readwrite');
        const store = transaction.objectStore('metadata');
        
        const metadata = {
            key,
            value,
            updatedAt: new Date().toISOString()
        };

        return new Promise((resolve, reject) => {
            const request = store.put(metadata);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取元数据
     */
    async getMetadata(key) {
        const transaction = await this.beginTransaction(['metadata'], 'readonly');
        const store = transaction.objectStore('metadata');
        
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.value : null);
            request.onerror = () => reject(request.error);
        });
    }

    // ========== 数据库维护 ==========

    /**
     * 清空数据库
     */
    async clearDatabase() {
        const transaction = await this.beginTransaction(['sessions', 'prompts', 'search_index', 'metadata'], 'readwrite');
        
        const stores = ['sessions', 'prompts', 'search_index', 'metadata'];
        for (const storeName of stores) {
            const store = transaction.objectStore(storeName);
            await new Promise((resolve, reject) => {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }

    /**
     * 获取数据库统计信息
     */
    async getStats() {
        const [sessions, prompts, searchIndex, metadata] = await Promise.all([
            this.getAllSessions(),
            this.getAllPrompts(),
            this.getAllSearchIndex(),
            this.getAllMetadata()
        ]);

        return {
            sessions: {
                count: sessions.length,
                totalMessages: sessions.reduce((sum, session) => sum + (session.messages?.length || 0), 0),
                lastUpdated: sessions.length > 0 ? Math.max(...sessions.map(s => new Date(s.updatedAt))) : null
            },
            prompts: {
                count: prompts.length,
                categories: [...new Set(prompts.map(p => p.category).filter(Boolean))],
                autoSelectCount: prompts.filter(p => p.autoSelect).length,
                lastUpdated: prompts.length > 0 ? Math.max(...prompts.map(p => new Date(p.updatedAt))) : null
            },
            searchIndex: {
                count: searchIndex.length,
                types: [...new Set(searchIndex.map(i => i.type))]
            },
            metadata: {
                count: metadata.length
            }
        };
    }

    /**
     * 获取所有搜索索引项
     */
    async getAllSearchIndex() {
        const transaction = await this.beginTransaction(['search_index'], 'readonly');
        const store = transaction.objectStore('search_index');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 获取所有元数据
     */
    async getAllMetadata() {
        const transaction = await this.beginTransaction(['metadata'], 'readonly');
        const store = transaction.objectStore('metadata');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 关闭数据库连接
     */
    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
            this.initPromise = null;
        }
    }
}

// 导出DatabaseManager类
window.DatabaseManager = DatabaseManager;