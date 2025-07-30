/**
 * 数据迁移管理器
 * 负责将Chrome Storage中的数据迁移到IndexedDB
 */
class DataMigrationManager {
    constructor() {
        this.dbManager = new DatabaseManager();
        this.migrationCompleted = false;
    }

    /**
     * 执行完整的数据迁移
     */
    async migrate() {
        try {
            console.log('Starting data migration...');
            
            // 初始化数据库
            await this.dbManager.init();
            
            // 检查是否已经完成迁移
            const migrationStatus = await this.dbManager.getMetadata('migration_completed');
            if (migrationStatus) {
                console.log('Migration already completed');
                this.migrationCompleted = true;
                return true;
            }

            // 迁移聊天历史到会话
            await this.migrateChatHistory();
            
            // 迁移设置数据
            await this.migrateSettings();
            
            // 迁移MCP服务配置
            await this.migrateMCPServices();
            
            // 标记迁移完成
            await this.dbManager.saveMetadata('migration_completed', true);
            await this.dbManager.saveMetadata('migration_timestamp', new Date().toISOString());
            
            this.migrationCompleted = true;
            console.log('Data migration completed successfully');
            return true;
            
        } catch (error) {
            console.error('Data migration failed:', error);
            throw error;
        }
    }

    /**
     * 迁移聊天历史数据
     */
    async migrateChatHistory() {
        try {
            const result = await chrome.storage.local.get(['chatHistory']);
            const chatHistory = result.chatHistory || [];
            
            if (chatHistory.length === 0) {
                console.log('No chat history to migrate');
                return;
            }

            console.log(`Migrating ${chatHistory.length} messages from chat history`);

            // 创建默认会话
            const defaultSession = {
                id: 'session_default',
                name: '默认会话',
                description: '从Chrome Storage迁移的聊天历史',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: chatHistory.map(msg => ({
                    id: msg.id || Date.now().toString() + Math.random(),
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp || new Date().toISOString()
                })),
                metadata: {
                    messageCount: chatHistory.length,
                    totalTokens: this.calculateTotalTokens(chatHistory),
                    tags: ['迁移数据', '默认会话'],
                    migratedFrom: 'chrome_storage'
                }
            };

            // 保存会话
            await this.dbManager.saveSession(defaultSession);
            
            // 更新搜索索引
            await this.updateSessionSearchIndex(defaultSession);
            
            console.log('Chat history migration completed');
            
        } catch (error) {
            console.error('Failed to migrate chat history:', error);
            throw error;
        }
    }

    /**
     * 迁移设置数据
     */
    async migrateSettings() {
        try {
            const result = await chrome.storage.sync.get(['apiUrl', 'apiKey', 'temperature', 'model', 'mcpBridgeUrl', 'mcpServers']);
            
            const settings = {
                apiUrl: result.apiUrl || '',
                apiKey: result.apiKey || '',
                temperature: result.temperature || '0.7',
                model: result.model || 'gpt-3.5-turbo',
                mcpBridgeUrl: result.mcpBridgeUrl || '',
                mcpServers: result.mcpServers || {}
            };

            // 保存设置到元数据
            await this.dbManager.saveMetadata('app_settings', settings);
            
            console.log('Settings migration completed');
            
        } catch (error) {
            console.error('Failed to migrate settings:', error);
            throw error;
        }
    }

    /**
     * 迁移MCP服务配置
     */
    async migrateMCPServices() {
        try {
            const result = await chrome.storage.local.get(['selectedMCPServices']);
            const selectedServices = result.selectedMCPServices || [];
            
            if (selectedServices.length === 0) {
                console.log('No MCP services to migrate');
                return;
            }

            // 保存MCP服务配置到元数据
            await this.dbManager.saveMetadata('selected_mcp_services', selectedServices);
            
            console.log('MCP services migration completed');
            
        } catch (error) {
            console.error('Failed to migrate MCP services:', error);
            throw error;
        }
    }

    /**
     * 计算消息总token数（简化版）
     */
    calculateTotalTokens(messages) {
        return messages.reduce((total, msg) => {
            return total + Math.ceil(msg.content.length / 4); // 简单估算
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
     * 回滚迁移
     */
    async rollback() {
        try {
            console.log('Starting migration rollback...');
            
            // 清空数据库
            await this.dbManager.clearDatabase();
            
            // 删除迁移标记
            await chrome.storage.local.remove(['migration_completed']);
            await chrome.storage.local.remove(['migration_timestamp']);
            
            this.migrationCompleted = false;
            console.log('Migration rollback completed');
            
        } catch (error) {
            console.error('Migration rollback failed:', error);
            throw error;
        }
    }

    /**
     * 获取迁移状态
     */
    async getMigrationStatus() {
        try {
            const migrationCompleted = await this.dbManager.getMetadata('migration_completed');
            const migrationTimestamp = await this.dbManager.getMetadata('migration_timestamp');
            
            return {
                completed: !!migrationCompleted,
                timestamp: migrationTimestamp,
                databaseReady: this.dbManager.isInitialized
            };
            
        } catch (error) {
            console.error('Failed to get migration status:', error);
            return {
                completed: false,
                timestamp: null,
                databaseReady: false,
                error: error.message
            };
        }
    }

    /**
     * 验证迁移数据完整性
     */
    async validateMigration() {
        try {
            const sessions = await this.dbManager.getAllSessions();
            const settings = await this.dbManager.getMetadata('app_settings');
            const mcpServices = await this.dbManager.getMetadata('selected_mcp_services');
            
            const issues = [];
            
            // 验证会话数据
            if (sessions.length === 0) {
                issues.push('No sessions found after migration');
            }
            
            // 验证设置数据
            if (!settings) {
                issues.push('No settings found after migration');
            }
            
            // 验证消息完整性
            sessions.forEach(session => {
                if (!session.messages || session.messages.length === 0) {
                    issues.push(`Session ${session.id} has no messages`);
                }
                
                session.messages.forEach(msg => {
                    if (!msg.id || !msg.role || !msg.content) {
                        issues.push(`Invalid message in session ${session.id}`);
                    }
                });
            });
            
            return {
                valid: issues.length === 0,
                issues,
                summary: {
                    sessions: sessions.length,
                    totalMessages: sessions.reduce((sum, session) => sum + (session.messages?.length || 0), 0),
                    hasSettings: !!settings,
                    hasMCPServices: !!mcpServices
                }
            };
            
        } catch (error) {
            console.error('Migration validation failed:', error);
            return {
                valid: false,
                issues: [error.message],
                summary: null
            };
        }
    }

    /**
     * 清理Chrome Storage中的旧数据
     */
    async cleanupOldData() {
        try {
            console.log('Cleaning up old Chrome Storage data...');
            
            // 备份重要数据
            const backup = await chrome.storage.local.get(null);
            await this.dbManager.saveMetadata('chrome_storage_backup', backup);
            
            // 清理聊天历史
            await chrome.storage.local.remove(['chatHistory']);
            
            console.log('Old data cleanup completed');
            
        } catch (error) {
            console.error('Failed to cleanup old data:', error);
            throw error;
        }
    }
}

// 导出DataMigrationManager类
window.DataMigrationManager = DataMigrationManager;