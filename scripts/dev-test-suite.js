/**
 * 开发测试脚本
 * 用于验证会话管理和Prompt管理功能
 */
class DevTestSuite {
    constructor() {
        this.tests = [];
        this.results = [];
    }

    /**
     * 添加测试用例
     */
    addTest(name, testFunction) {
        this.tests.push({ name, testFunction });
    }

    /**
     * 运行所有测试
     */
    async runAllTests() {
        console.log('🧪 开始运行开发测试...');
        
        for (const test of this.tests) {
            try {
                console.log(`\n📋 运行测试: ${test.name}`);
                const result = await test.testFunction();
                this.results.push({ name: test.name, status: 'passed', result });
                console.log(`✅ 测试通过: ${test.name}`);
            } catch (error) {
                this.results.push({ name: test.name, status: 'failed', error: error.message });
                console.error(`❌ 测试失败: ${test.name}`, error);
            }
        }

        this.printTestSummary();
    }

    /**
     * 打印测试摘要
     */
    printTestSummary() {
        const passed = this.results.filter(r => r.status === 'passed').length;
        const failed = this.results.filter(r => r.status === 'failed').length;
        
        console.log('\n📊 测试摘要:');
        console.log(`总共: ${this.results.length}`);
        console.log(`通过: ${passed}`);
        console.log(`失败: ${failed}`);
        
        if (failed > 0) {
            console.log('\n❌ 失败的测试:');
            this.results.filter(r => r.status === 'failed').forEach(r => {
                console.log(`  - ${r.name}: ${r.error}`);
            });
        }
    }

    /**
     * 数据库测试
     */
    testDatabaseManager() {
        return new Promise(async (resolve, reject) => {
            try {
                const dbManager = new DatabaseManager();
                await dbManager.init();
                
                // 测试创建会话
                const testSession = {
                    id: 'test_session_' + Date.now(),
                    name: '测试会话',
                    description: '用于测试的会话',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    messages: [
                        {
                            id: 'test_msg_1',
                            role: 'user',
                            content: '你好',
                            timestamp: new Date().toISOString()
                        },
                        {
                            id: 'test_msg_2',
                            role: 'assistant',
                            content: '你好！有什么可以帮助你的吗？',
                            timestamp: new Date().toISOString()
                        }
                    ],
                    metadata: {
                        messageCount: 2,
                        totalTokens: 20,
                        tags: ['测试']
                    }
                };

                await dbManager.saveSession(testSession);
                
                // 测试读取会话
                const retrievedSession = await dbManager.getSession(testSession.id);
                if (!retrievedSession || retrievedSession.name !== testSession.name) {
                    throw new Error('会话保存/读取失败');
                }

                // 测试搜索功能
                const searchResults = await dbManager.searchSessions('测试');
                if (searchResults.length === 0) {
                    throw new Error('会话搜索功能失败');
                }

                // 清理测试数据
                await dbManager.deleteSession(testSession.id);
                await dbManager.close();

                resolve('数据库管理器测试通过');
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 会话管理器测试
     */
    testSessionManager() {
        return new Promise(async (resolve, reject) => {
            try {
                const dbManager = new DatabaseManager();
                await dbManager.init();
                
                const sessionManager = new SessionManager(dbManager);
                await sessionManager.init();

                // 测试创建会话
                const session = await sessionManager.createSession('测试会话', '测试描述');
                if (!session || !session.id) {
                    throw new Error('会话创建失败');
                }

                // 测试添加消息
                const message = await sessionManager.addMessage(session.id, 'user', '测试消息');
                if (!message || !message.id) {
                    throw new Error('消息添加失败');
                }

                // 测试获取会话
                const retrievedSession = sessionManager.getSession(session.id);
                if (!retrievedSession || retrievedSession.messages.length !== 1) {
                    throw new Error('会话获取失败');
                }

                // 测试更新会话
                await sessionManager.updateSession(session.id, { name: '更新的会话名' });
                const updatedSession = sessionManager.getSession(session.id);
                if (updatedSession.name !== '更新的会话名') {
                    throw new Error('会话更新失败');
                }

                // 测试删除会话
                await sessionManager.deleteSession(session.id);
                const deletedSession = sessionManager.getSession(session.id);
                if (deletedSession) {
                    throw new Error('会话删除失败');
                }

                await sessionManager.destroy();
                await dbManager.close();

                resolve('会话管理器测试通过');
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Prompt管理器测试
     */
    testPromptManager() {
        return new Promise(async (resolve, reject) => {
            try {
                const dbManager = new DatabaseManager();
                await dbManager.init();
                
                const promptManager = new PromptManager(dbManager);
                await promptManager.init();

                // 测试获取内置Prompt
                const builtinPrompts = promptManager.getAllPrompts();
                if (builtinPrompts.length === 0) {
                    throw new Error('内置Prompt加载失败');
                }

                // 测试创建自定义Prompt
                const customPrompt = await promptManager.createPrompt({
                    name: '测试Prompt',
                    category: 'test',
                    description: '用于测试的Prompt',
                    tags: ['测试'],
                    template: '这是一个测试模板: {variable}',
                    autoSelect: false
                });

                if (!customPrompt || !customPrompt.id) {
                    throw new Error('Prompt创建失败');
                }

                // 测试搜索Prompt
                const searchResults = await promptManager.searchPrompts('测试');
                if (searchResults.length === 0) {
                    throw new Error('Prompt搜索失败');
                }

                // 测试智能匹配
                const matches = await promptManager.matchPrompts('代码审查');
                if (matches.length === 0) {
                    throw new Error('Prompt智能匹配失败');
                }

                // 测试使用Prompt
                const result = await promptManager.usePrompt(customPrompt.id, { variable: '测试值' });
                if (!result.renderedTemplate || !result.renderedTemplate.includes('测试值')) {
                    throw new Error('Prompt使用失败');
                }

                // 测试删除Prompt
                await promptManager.deletePrompt(customPrompt.id);
                const deletedPrompt = promptManager.getPrompt(customPrompt.id);
                if (deletedPrompt) {
                    throw new Error('Prompt删除失败');
                }

                await promptManager.destroy();
                await dbManager.close();

                resolve('Prompt管理器测试通过');
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 数据迁移测试
     */
    testDataMigration() {
        return new Promise(async (resolve, reject) => {
            try {
                const migrationManager = new DataMigrationManager();
                
                // 模拟Chrome Storage数据
                const mockChatHistory = [
                    {
                        id: 'msg_1',
                        role: 'user',
                        content: '测试消息1',
                        timestamp: new Date().toISOString()
                    },
                    {
                        id: 'msg_2',
                        role: 'assistant',
                        content: '测试回复1',
                        timestamp: new Date().toISOString()
                    }
                ];

                // 保存模拟数据到Chrome Storage
                await chrome.storage.local.set({ chatHistory: mockChatHistory });

                // 执行迁移
                await migrationManager.migrate();

                // 验证迁移结果
                const dbManager = new DatabaseManager();
                await dbManager.init();
                
                const sessions = await dbManager.getAllSessions();
                const migratedSession = sessions.find(s => s.name === '默认会话');
                
                if (!migratedSession || migratedSession.messages.length !== 2) {
                    throw new Error('数据迁移失败');
                }

                // 验证迁移标记
                const migrationCompleted = await dbManager.getMetadata('migration_completed');
                if (!migrationCompleted) {
                    throw new Error('迁移标记设置失败');
                }

                await dbManager.close();
                await migrationManager.dbManager.close();

                resolve('数据迁移测试通过');
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 运行完整测试套件
     */
    async runFullTestSuite() {
        this.addTest('数据库管理器', () => this.testDatabaseManager());
        this.addTest('会话管理器', () => this.testSessionManager());
        this.addTest('Prompt管理器', () => this.testPromptManager());
        this.addTest('数据迁移', () => this.testDataMigration());

        await this.runAllTests();
    }
}

// 导出到全局作用域
window.DevTestSuite = DevTestSuite;

// 提供便捷的测试函数
window.runDevTests = async function() {
    const testSuite = new DevTestSuite();
    await testSuite.runFullTestSuite();
};

console.log('🧪 开发测试套件已加载，使用 runDevTests() 运行测试');