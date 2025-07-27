/**
 * Model Context Protocol (MCP) Service
 * 通过HTTP桥接服务与MCP服务器通信
 */
class MCPService {
    constructor() {
        this.bridgeUrl = 'http://localhost:3001';
        this.mcpServers = new Map();
        this.availableTools = new Map();
        this.defaultServersInitialized = false; // 添加标志防止重复初始化
        this.init();
    }

    async init() {
        console.log('[MCP-DEBUG] 开始初始化MCP服务...');
        try {
            await this.loadMCPConfig();
            await this.checkBridgeConnection();
            
            // 加载保存的服务器配置
            this.loadSavedServers();
            
            console.log('[MCP-DEBUG] MCP服务初始化完成');
            console.log('[MCP-DEBUG] 最终状态:', this.getBridgeStatus());
        } catch (error) {
            console.error('[MCP-ERROR] MCP服务初始化失败:', error);
            // 即使初始化失败也要加载保存的服务器
            this.loadSavedServers();
        }
    }

    async loadMCPConfig() {
        console.log('[MCP-DEBUG] 开始加载MCP配置...');
        try {
            const config = await chrome.storage.sync.get(['mcpBridgeUrl', 'mcpServers']);
            console.log('[MCP-DEBUG] 读取到的配置:', config);
            
            if (config.mcpBridgeUrl) {
                this.bridgeUrl = config.mcpBridgeUrl;
                console.log('[MCP-DEBUG] 设置桥接URL:', this.bridgeUrl);
            }
            if (config.mcpServers) {
                this.savedServers = config.mcpServers;
                const serverCount = Array.isArray(config.mcpServers) ? 
                    config.mcpServers.length : 
                    Object.keys(config.mcpServers).length;
                console.log('[MCP-DEBUG] 加载保存的服务器:', serverCount, '个');
            }
            console.log('[MCP-DEBUG] MCP配置加载完成');
        } catch (error) {
            console.error('[MCP-ERROR] 加载MCP配置失败:', error);
        }
    }

    async checkBridgeConnection() {
        console.log('[MCP-DEBUG] 检查桥接服务器连接...', this.bridgeUrl);
        
        // 检查是否在Chrome扩展环境中
        const isExtension = typeof chrome !== 'undefined' && chrome.runtime;
        console.log('[MCP-DEBUG] 运行环境:', isExtension ? 'Chrome扩展' : '普通网页');
        
        try {
            const startTime = Date.now();
            
            // 在Chrome扩展中使用background script代理
            if (isExtension) {
                console.log('[MCP-DEBUG] 使用background代理发送请求');
                const response = await this.sendBackgroundRequest(`${this.bridgeUrl}/api/health`);
                const responseTime = Date.now() - startTime;
                
                console.log('[MCP-DEBUG] 代理响应:', {
                    url: `${this.bridgeUrl}/api/health`,
                    success: response.success,
                    status: response.status,
                    responseTime: responseTime + 'ms'
                });
                
                if (response.success && response.ok) {
                    this.bridgeConnected = true;
                    console.log('[MCP-DEBUG] 桥接服务器健康检查成功:', response.data);
                    console.log('[MCP-DEBUG] 桥接服务器连接状态: 已连接');
                    return true;
                } else {
                    throw new Error(`Bridge server responding with status ${response.status}: ${response.statusText}`);
                }
            } else {
                // 在普通网页中直接使用fetch
                console.log('[MCP-DEBUG] 直接使用fetch发送请求');
                const requestOptions = {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                
                if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
                    try {
                        requestOptions.signal = AbortSignal.timeout(5000);
                    } catch (e) {
                        console.log('[MCP-DEBUG] AbortSignal.timeout不可用，使用手动超时');
                    }
                }
                
                const response = await fetch(`${this.bridgeUrl}/api/health`, requestOptions);
                const responseTime = Date.now() - startTime;
                
                console.log('[MCP-DEBUG] 桥接服务器响应:', {
                    url: `${this.bridgeUrl}/api/health`,
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok,
                    responseTime: responseTime + 'ms'
                });
                
                if (response.ok) {
                    const healthData = await response.json();
                    this.bridgeConnected = true;
                    console.log('[MCP-DEBUG] 桥接服务器健康检查成功:', healthData);
                    console.log('[MCP-DEBUG] 桥接服务器连接状态: 已连接');
                    return true;
                } else {
                    throw new Error(`Bridge server responding with status ${response.status}: ${response.statusText}`);
                }
            }
        } catch (error) {
            this.bridgeConnected = false;
            
            // 详细的错误信息
            const errorInfo = {
                url: this.bridgeUrl,
                error: error.message,
                type: error.name,
                stack: error.stack
            };
            
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                console.error('[MCP-ERROR] 网络连接失败 - 可能是CORS、网络策略或服务器未运行:', errorInfo);
                console.log('[MCP-HELP] 故障排查建议:');
                console.log('1. 确认MCP桥接服务器正在运行: npm start');
                console.log('2. 确认服务器地址正确:', this.bridgeUrl);
                console.log('3. 检查Chrome扩展权限和CORS设置');
                console.log('4. 尝试在浏览器直接访问:', `${this.bridgeUrl}/api/health`);
            } else if (error.name === 'AbortError') {
                console.error('[MCP-ERROR] 请求超时 - 桥接服务器响应太慢:', errorInfo);
            } else {
                console.warn('[MCP-WARN] 桥接服务器连接失败（这是正常的，如果你没有运行MCP桥接服务器）:', errorInfo);
            }
            
            console.log('[MCP-DEBUG] 桥接服务器连接状态: 未连接');
            console.log('[MCP-INFO] 要启用MCP工具，请运行: cd mcp-bridge && npm start');
            return false;
        }
    }

    // 通过background script发送请求的辅助方法
    async sendBackgroundRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
                action: 'mcpBridgeRequest',
                url,
                options
            }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response);
                }
            });
        });
    }

    async loadAvailableServers() {
        console.log('[MCP-DEBUG] 开始加载可用服务器...');
        
        // 首先加载保存的服务器配置
        this.loadSavedServers();
        
        if (!this.bridgeConnected) {
            console.log('[MCP-DEBUG] 桥接服务器未连接，跳过远程服务器加载');
            this.initializeDefaultServers();
            return;
        }

        try {
            console.log('[MCP-DEBUG] 从桥接服务器获取服务器列表...');
            
            // 检查是否在Chrome扩展环境中
            const isExtension = typeof chrome !== 'undefined' && chrome.runtime;
            let data;
            
            if (isExtension) {
                console.log('[MCP-DEBUG] 使用background代理获取服务器列表');
                const response = await this.sendBackgroundRequest(`${this.bridgeUrl}/api/mcp/servers`);
                if (!response.success) {
                    throw new Error(response.error);
                }
                data = response.data;
            } else {
                console.log('[MCP-DEBUG] 直接获取服务器列表');
                const response = await fetch(`${this.bridgeUrl}/api/mcp/servers`);
                data = await response.json();
            }
            
            console.log('[MCP-DEBUG] 桥接服务器返回服务器数据:', data);
            
            if (data.servers && Array.isArray(data.servers)) {
                console.log('[MCP-DEBUG] 处理服务器列表，共', data.servers.length, '个服务器');
                
                data.servers.forEach(server => {
                    console.log('[MCP-DEBUG] 注册服务器:', server.name, '状态:', server.status);
                    this.mcpServers.set(server.name, server);
                    
                    // 注册工具到全局工具映射
                    if (server.tools && Array.isArray(server.tools)) {
                        console.log('[MCP-DEBUG] 服务器', server.name, '提供工具:', server.tools.map(t => t.name));
                        server.tools.forEach(tool => {
                            this.availableTools.set(tool.name, {
                                ...tool,
                                serverName: server.name
                            });
                        });
                    } else {
                        console.log('[MCP-DEBUG] 服务器', server.name, '没有提供工具');
                    }
                });
            }

            // 加载预定义的服务器配置
            this.initializeDefaultServers();
            
            console.log('[MCP-DEBUG] 服务器加载完成，总计:', this.mcpServers.size, '个服务器');
            console.log('[MCP-DEBUG] 总可用工具数:', this.availableTools.size);
            
        } catch (error) {
            console.error('[MCP-ERROR] 加载MCP服务器失败:', error);
            // 即使加载失败也要初始化默认服务器
            this.initializeDefaultServers();
        }
    }

    loadSavedServers() {
        console.log('[MCP-DEBUG] 开始加载保存的服务器配置...');
        
        if (!this.savedServers) {
            console.log('[MCP-DEBUG] 没有保存的服务器配置');
            return;
        }
        
        let serverEntries = [];
        
        // 支持两种格式：数组格式和对象格式
        if (Array.isArray(this.savedServers)) {
            // 数组格式：[[name, config], [name, config]]
            serverEntries = this.savedServers;
            console.log('[MCP-DEBUG] 检测到数组格式的配置');
        } else if (typeof this.savedServers === 'object') {
            // 对象格式：{name: config, name: config}
            serverEntries = Object.entries(this.savedServers);
            console.log('[MCP-DEBUG] 检测到对象格式的配置');
        } else {
            console.log('[MCP-DEBUG] 不支持的配置格式:', typeof this.savedServers);
            return;
        }
        
        console.log('[MCP-DEBUG] 处理', serverEntries.length, '个保存的服务器');
        
        // 清空现有的服务器，确保只加载保存的服务器
        this.mcpServers.clear();
        
        serverEntries.forEach(([serverName, serverConfig]) => {
            console.log('[MCP-DEBUG] 加载保存的服务器:', serverName, serverConfig);
            
            const server = {
                name: serverName,
                description: serverConfig.description || `${serverName} MCP服务器`,
                status: 'disconnected',
                imported: true  // 标记为导入的服务器
            };

            // 根据类型设置不同的配置
            if (serverConfig.type === 'streamable-http') {
                server.type = 'streamable-http';
                server.url = serverConfig.url;
                server.headers = serverConfig.headers || {};
            } else {
                // 默认为进程类型
                server.command = serverConfig.command;
                server.args = serverConfig.args || [];
                server.env = serverConfig.env || {};
            }

            this.mcpServers.set(serverName, server);
            console.log('[MCP-DEBUG] 成功加载保存的服务器:', serverName);
        });
        
        console.log('[MCP-DEBUG] 保存的服务器加载完成，总计:', serverEntries.length, '个');
        console.log('[MCP-DEBUG] 当前MCP服务器列表:', Array.from(this.mcpServers.keys()));
    }

    initializeDefaultServers() {
        // 防止重复初始化
        if (this.defaultServersInitialized) {
            console.log('[MCP-DEBUG] 默认服务器已初始化，跳过');
            return;
        }
        
        console.log('[MCP-DEBUG] 初始化默认服务器...');
        
        const defaultServers = [
            {
                name: 'filesystem',
                description: '文件系统操作工具',
                command: 'npx',
                args: ['@modelcontextprotocol/server-filesystem', './'],
                enabled: false,
                status: 'disconnected',
                tools: [
                    {
                        name: 'list_directory',
                        description: '列出目录内容',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                path: {
                                    type: 'string',
                                    description: '要列出的目录路径'
                                }
                            },
                            required: ['path']
                        }
                    },
                    {
                        name: 'read_file',
                        description: '读取文件内容',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                path: {
                                    type: 'string',
                                    description: '要读取的文件路径'
                                }
                            },
                            required: ['path']
                        }
                    },
                    {
                        name: 'write_file',
                        description: '写入文件内容',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                path: {
                                    type: 'string',
                                    description: '要写入的文件路径'
                                },
                                content: {
                                    type: 'string',
                                    description: '文件内容'
                                }
                            },
                            required: ['path', 'content']
                        }
                    }
                ]
            },
            {
                name: 'brave-search',
                description: '网络搜索工具',
                command: 'npx',
                args: ['@modelcontextprotocol/server-brave-search'],
                enabled: false,
                status: 'disconnected',
                requiresApiKey: true,
                tools: [
                    {
                        name: 'brave_web_search',
                        description: '使用Brave搜索引擎搜索网络内容',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: '搜索查询'
                                },
                                count: {
                                    type: 'number',
                                    description: '返回结果数量',
                                    default: 10
                                }
                            },
                            required: ['query']
                        }
                    }
                ]
            },
            {
                name: 'git',
                description: 'Git版本控制工具',
                command: 'npx',
                args: ['@modelcontextprotocol/server-git', './'],
                enabled: false,
                status: 'disconnected',
                tools: [
                    {
                        name: 'git_status',
                        description: '获取Git仓库状态',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'git_log',
                        description: '获取Git提交日志',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                max_count: {
                                    type: 'number',
                                    description: '最大提交数量',
                                    default: 10
                                }
                            }
                        }
                    },
                    {
                        name: 'git_diff',
                        description: '获取Git差异',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                cached: {
                                    type: 'boolean',
                                    description: '是否显示暂存区差异',
                                    default: false
                                }
                            }
                        }
                    }
                ]
            },
            {
                name: 'sqlite',
                description: 'SQLite数据库工具',
                command: 'npx',
                args: ['@modelcontextprotocol/server-sqlite'],
                enabled: false,
                status: 'disconnected',
                tools: [
                    {
                        name: 'sqlite_query',
                        description: '执行SQLite查询',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                database: {
                                    type: 'string',
                                    description: '数据库文件路径'
                                },
                                query: {
                                    type: 'string',
                                    description: 'SQL查询语句'
                                }
                            },
                            required: ['database', 'query']
                        }
                    }
                ]
            }
        ];

        let addedCount = 0;
        defaultServers.forEach(server => {
            if (!this.mcpServers.has(server.name)) {
                this.mcpServers.set(server.name, server);
                addedCount++;
                console.log('[MCP-DEBUG] 添加默认服务器:', server.name);
                
                // 注册默认工具到全局工具映射
                if (server.tools && Array.isArray(server.tools)) {
                    console.log('[MCP-DEBUG] 注册默认工具:', server.name, '工具数量:', server.tools.length);
                    server.tools.forEach(tool => {
                        this.availableTools.set(tool.name, {
                            ...tool,
                            serverName: server.name
                        });
                        console.log('[MCP-DEBUG] 注册工具:', tool.name, '来自服务器:', server.name);
                    });
                }
            } else {
                console.log('[MCP-DEBUG] 默认服务器已存在，跳过:', server.name);
            }
        });
        
        console.log('[MCP-DEBUG] 默认服务器初始化完成，新增', addedCount, '个');
        this.defaultServersInitialized = true; // 设置初始化标志
    }

    async connectToServer(serverName, customConfig = null) {
        console.log('[MCP-DEBUG] 尝试连接服务器:', serverName);
        console.log('[MCP-DEBUG] 自定义配置:', customConfig);
        
        const server = this.mcpServers.get(serverName);
        if (!server) {
            const error = `MCP server '${serverName}' not found`;
            console.error('[MCP-ERROR]', error);
            throw new Error(error);
        }

        console.log('[MCP-DEBUG] 服务器当前状态:', server.status);
        console.log('[MCP-DEBUG] 服务器信息:', {
            name: server.name,
            description: server.description,
            command: server.command,
            args: server.args,
            type: server.type
        });

        if (!this.bridgeConnected) {
            const error = 'MCP Bridge server is not available. Please start the bridge server first.';
            console.error('[MCP-ERROR]', error);
            throw new Error(error);
        }

        try {
            const config = customConfig || {
                command: server.command,
                args: server.args,
                description: server.description,
                type: server.type,
                url: server.url,
                headers: server.headers
            };

            console.log('[MCP-DEBUG] 发送连接请求到桥接服务器...');
            console.log('[MCP-DEBUG] 请求URL:', `${this.bridgeUrl}/api/mcp/servers/${serverName}/connect`);
            console.log('[MCP-DEBUG] 请求配置:', config);

            // 检查是否在Chrome扩展环境中
            const isExtension = typeof chrome !== 'undefined' && chrome.runtime;
            let result;

            if (isExtension) {
                console.log('[MCP-DEBUG] 使用background代理发送连接请求');
                const response = await this.sendBackgroundRequest(
                    `${this.bridgeUrl}/api/mcp/servers/${serverName}/connect`,
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(config)
                    }
                );

                console.log('[MCP-DEBUG] 代理响应状态:', response.status, response.statusText);

                if (!response.success) {
                    throw new Error(response.error);
                }

                result = response.data;
            } else {
                console.log('[MCP-DEBUG] 直接发送连接请求');
                const response = await fetch(`${this.bridgeUrl}/api/mcp/servers/${serverName}/connect`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(config)
                });

                console.log('[MCP-DEBUG] 桥接服务器响应状态:', response.status, response.statusText);
                result = await response.json();
            }
            
            console.log('[MCP-DEBUG] 桥接服务器返回结果:', result);

            if (result.error) {
                console.error('[MCP-ERROR] 连接失败:', result.error);
                throw new Error(result.error);
            }

            // 更新服务器状态
            server.status = 'connected';
            server.tools = result.tools || [];
            
            console.log('[MCP-DEBUG] 服务器连接成功，获得工具:', server.tools.map(t => t.name));
            
            // 注册工具到全局工具映射
            server.tools.forEach(tool => {
                console.log('[MCP-DEBUG] 注册工具:', tool.name, '到全局映射');
                this.availableTools.set(tool.name, {
                    ...tool,
                    serverName
                });
            });

            console.log('[MCP-DEBUG] 服务器', serverName, '连接完成，当前全局工具数:', this.availableTools.size);
            return true;

        } catch (error) {
            server.status = 'error';
            console.error('[MCP-ERROR] 连接服务器', serverName, '失败:', error);
            console.error('[MCP-ERROR] 错误详情:', {
                message: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    async disconnectFromServer(serverName) {
        const server = this.mcpServers.get(serverName);
        if (!server) return;

        if (!this.bridgeConnected) return;

        try {
            // 检查是否在Chrome扩展环境中
            const isExtension = typeof chrome !== 'undefined' && chrome.runtime;
            let success = false;

            if (isExtension) {
                console.log('[MCP-DEBUG] 使用background代理断开服务器连接');
                const response = await this.sendBackgroundRequest(
                    `${this.bridgeUrl}/api/mcp/servers/${serverName}/disconnect`,
                    {
                        method: 'POST'
                    }
                );
                success = response.success && response.ok;
            } else {
                console.log('[MCP-DEBUG] 直接断开服务器连接');
                const response = await fetch(`${this.bridgeUrl}/api/mcp/servers/${serverName}/disconnect`, {
                    method: 'POST'
                });
                success = response.ok;
            }

            if (success) {
                server.status = 'disconnected';
                
                // 从工具映射中移除
                if (server.tools) {
                    server.tools.forEach(tool => {
                        this.availableTools.delete(tool.name);
                    });
                }
                
                server.tools = [];
                console.log(`Disconnected from MCP server: ${serverName}`);
            }
        } catch (error) {
            console.error(`Failed to disconnect from MCP server '${serverName}':`, error);
        }
    }

    async callTool(toolName, parameters = {}) {
        console.log('[MCP-DEBUG] 调用工具:', toolName);
        console.log('[MCP-DEBUG] 工具参数:', parameters);
        
        const tool = this.availableTools.get(toolName);
        if (!tool) {
            const error = `Tool '${toolName}' not found`;
            console.error('[MCP-ERROR]', error);
            console.log('[MCP-DEBUG] 当前可用工具:', Array.from(this.availableTools.keys()));
            throw new Error(error);
        }

        console.log('[MCP-DEBUG] 找到工具:', {
            name: tool.name,
            serverName: tool.serverName,
            description: tool.description
        });

        if (!this.bridgeConnected) {
            console.log('[MCP-DEBUG] 桥接服务器未连接，提供模拟响应');
            // 为演示目的提供模拟响应
            const mockResponse = this.generateMockResponse(toolName, parameters);
            console.log('[MCP-DEBUG] 生成模拟响应:', mockResponse);
            return mockResponse;
        }

        try {
            const requestUrl = `${this.bridgeUrl}/api/mcp/tools/${tool.serverName}/${toolName}`;
            const requestBody = { parameters };
            
            console.log('[MCP-DEBUG] 发送工具调用请求:');
            console.log('[MCP-DEBUG] URL:', requestUrl);
            console.log('[MCP-DEBUG] Body:', requestBody);

            // 检查是否在Chrome扩展环境中
            const isExtension = typeof chrome !== 'undefined' && chrome.runtime;
            let result;

            if (isExtension) {
                console.log('[MCP-DEBUG] 使用background代理调用工具');
                const response = await this.sendBackgroundRequest(requestUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('[MCP-DEBUG] 代理工具调用响应状态:', response.status, response.statusText);

                if (!response.success) {
                    throw new Error(response.error);
                }

                result = response.data;
            } else {
                console.log('[MCP-DEBUG] 直接调用工具');
                const response = await fetch(requestUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                console.log('[MCP-DEBUG] 工具调用响应状态:', response.status, response.statusText);
                result = await response.json();
            }
            
            console.log('[MCP-DEBUG] 工具调用结果:', result);

            if (result.error) {
                console.error('[MCP-ERROR] 工具调用返回错误:', result.error);
                throw new Error(result.error);
            }

            console.log('[MCP-DEBUG] 工具', toolName, '调用成功');
            return result.result;

        } catch (error) {
            console.error('[MCP-ERROR] 工具调用失败:', {
                toolName,
                serverName: tool.serverName,
                error: error.message,
                stack: error.stack
            });
            throw error;
        }
    }

    // 生成模拟响应用于演示
    generateMockResponse(toolName, parameters) {
        const mockResponses = {
            'list_directory': {
                type: 'text',
                text: `模拟目录列表 (${parameters.path || './'}):\n- example.txt\n- folder1/\n- folder2/\n- README.md\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            },
            'read_file': {
                type: 'text', 
                text: `模拟文件内容 (${parameters.path}):\n\n这是一个示例文件的模拟内容。\n实际使用时会返回真实的文件内容。\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            },
            'write_file': {
                type: 'text',
                text: `模拟写入文件成功 (${parameters.path})\n内容长度: ${parameters.content?.length || 0} 字符\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            },
            'brave_web_search': {
                type: 'text',
                text: `模拟搜索结果 (查询: "${parameters.query}"):\n\n1. 示例结果1 - 相关信息...\n2. 示例结果2 - 更多信息...\n3. 示例结果3 - 其他相关内容...\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器和API密钥]`
            },
            'git_status': {
                type: 'text',
                text: `模拟Git状态:\n\n当前分支: main\n修改的文件:\n  M  example.js\n  A  new-file.txt\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            },
            'git_log': {
                type: 'text',
                text: `模拟Git日志:\n\ncommit abc123... (HEAD -> main)\nAuthor: User <user@example.com>\nDate: ${new Date().toISOString()}\n\n    最新提交示例\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            },
            'git_diff': {
                type: 'text',
                text: `模拟Git差异:\n\ndiff --git a/example.js b/example.js\nindex 123..456 100644\n--- a/example.js\n+++ b/example.js\n@@ -1,3 +1,4 @@\n console.log('hello');\n+console.log('new line');\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            },
            'sqlite_query': {
                type: 'text',
                text: `模拟SQLite查询结果 (数据库: ${parameters.database}):\n\n查询: ${parameters.query}\n\n结果示例:\nid | name | value\n1  | 示例1 | 100\n2  | 示例2 | 200\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
            }
        };

        return mockResponses[toolName] || {
            type: 'text',
            text: `模拟工具响应 (${toolName})\n参数: ${JSON.stringify(parameters, null, 2)}\n\n[注意：这是模拟响应，实际功能需要MCP桥接服务器]`
        };
    }

    getAvailableTools() {
        const tools = Array.from(this.availableTools.values());
        console.log('[MCP-DEBUG] 获取可用工具列表, 数量:', tools.length);
        if (tools.length > 0) {
            console.log('[MCP-DEBUG] 工具详情:', tools.map(t => ({ 
                name: t.name, 
                server: t.serverName,
                description: t.description?.substring(0, 50) 
            })));
        }
        return tools;
    }

    getConnectedServers() {
        const connected = Array.from(this.mcpServers.values()).filter(
            server => server.status === 'connected'
        );
        console.log('[MCP-DEBUG] 获取已连接服务器, 数量:', connected.length);
        if (connected.length > 0) {
            console.log('[MCP-DEBUG] 已连接服务器:', connected.map(s => ({
                name: s.name,
                status: s.status,
                tools: s.tools?.length || 0
            })));
        }
        return connected;
    }

    getAllServers() {
        const servers = Array.from(this.mcpServers.values());
        console.log('[MCP-DEBUG] 获取所有服务器, 数量:', servers.length);
        console.log('[MCP-DEBUG] 服务器状态分布:', {
            connected: servers.filter(s => s.status === 'connected').length,
            disconnected: servers.filter(s => s.status === 'disconnected').length,
            error: servers.filter(s => s.status === 'error').length,
            connecting: servers.filter(s => s.status === 'connecting').length
        });
        return servers;
    }

    // 智能分析消息是否需要使用MCP工具
    async analyzeMessageForTools(message) {
        console.log('[MCP-DEBUG] 开始分析消息是否需要工具:', message);
        
        const availableTools = this.getAvailableTools();
        console.log('[MCP-DEBUG] 当前可用工具数量:', availableTools.length);
        console.log('[MCP-DEBUG] 可用工具列表:', availableTools.map(t => ({ name: t.name, server: t.serverName })));
        
        if (availableTools.length === 0) {
            console.log('[MCP-DEBUG] 没有可用工具，跳过分析');
            return null;
        }

        const toolSuggestions = [];
        const lowerMessage = message.toLowerCase();

        console.log('[MCP-DEBUG] 分析消息关键词...');

        // 网络搜索相关 - 优先级最高
        const searchKeywords = /搜索|查找|search|find|最新|新闻|现在|当前|今天|实时|网上|在线|信息|资料|查询/;
        if (searchKeywords.test(lowerMessage)) {
            console.log('[MCP-DEBUG] 检测到搜索相关关键词');
            const searchTool = availableTools.find(t => 
                t.name.includes('search') || 
                t.name.includes('browse') || 
                t.name.includes('web') ||
                t.serverName.includes('search')
            );
            if (searchTool) {
                console.log('[MCP-DEBUG] 找到搜索工具:', searchTool.name);
                toolSuggestions.push({
                    tool: searchTool,
                    confidence: 0.9,
                    reason: '消息包含搜索或获取外部信息的意图'
                });
            } else {
                console.log('[MCP-DEBUG] 未找到搜索相关工具');
            }
        }

        // 文件系统相关
        const fileKeywords = /读取|查看|文件|目录|ls|cat|mkdir|写入|创建文件|打开文件/;
        if (fileKeywords.test(lowerMessage)) {
            console.log('[MCP-DEBUG] 检测到文件系统相关关键词');
            const fsTool = availableTools.find(t => 
                t.name.includes('read') || 
                t.name.includes('list') || 
                t.name.includes('write') ||
                t.name.includes('file')
            );
            if (fsTool) {
                console.log('[MCP-DEBUG] 找到文件系统工具:', fsTool.name);
                toolSuggestions.push({
                    tool: fsTool,
                    confidence: 0.8,
                    reason: '消息包含文件操作相关内容'
                });
            }
        }

        // Git相关  
        const gitKeywords = /git|版本|提交|commit|分支|branch|状态|status|仓库|repo/;
        if (gitKeywords.test(lowerMessage)) {
            console.log('[MCP-DEBUG] 检测到Git相关关键词');
            const gitTool = availableTools.find(t => 
                t.name.includes('git') || 
                t.serverName.includes('git')
            );
            if (gitTool) {
                console.log('[MCP-DEBUG] 找到Git工具:', gitTool.name);
                toolSuggestions.push({
                    tool: gitTool,
                    confidence: 0.7,
                    reason: '消息包含Git版本控制相关内容'
                });
            }
        }

        // 数据库相关
        const dbKeywords = /数据库|sql|查询|database|表|table|数据/;
        if (dbKeywords.test(lowerMessage)) {
            console.log('[MCP-DEBUG] 检测到数据库相关关键词');
            const dbTool = availableTools.find(t => 
                t.name.includes('sql') || 
                t.name.includes('database') ||
                t.serverName.includes('sql')
            );
            if (dbTool) {
                console.log('[MCP-DEBUG] 找到数据库工具:', dbTool.name);
                toolSuggestions.push({
                    tool: dbTool,
                    confidence: 0.7,
                    reason: '消息包含数据库相关内容'
                });
            }
        }

        // 通用外部信息请求检测
        const infoKeywords = /什么是|介绍|解释|告诉我|帮我了解|获取.*信息|查.*资料/;
        if (infoKeywords.test(lowerMessage)) {
            console.log('[MCP-DEBUG] 检测到通用信息请求关键词');
            const anyTool = availableTools[0]; // 使用第一个可用工具
            if (anyTool && !toolSuggestions.find(s => s.tool.name === anyTool.name)) {
                console.log('[MCP-DEBUG] 使用通用工具:', anyTool.name);
                toolSuggestions.push({
                    tool: anyTool,
                    confidence: 0.6,
                    reason: '消息可能需要外部信息支持'
                });
            }
        }

        console.log('[MCP-DEBUG] 工具分析完成，建议数量:', toolSuggestions.length);
        toolSuggestions.forEach((suggestion, index) => {
            console.log(`[MCP-DEBUG] 建议${index + 1}:`, {
                tool: suggestion.tool.name,
                server: suggestion.tool.serverName,
                confidence: suggestion.confidence,
                reason: suggestion.reason
            });
        });
        
        return toolSuggestions.length > 0 ? toolSuggestions : null;
    }

    // 格式化工具调用结果
    formatToolResult(toolName, result) {
        const MAX_RESULT_LENGTH = 2000; // 限制结果长度
        
        let formattedContent = '';
        
        // 处理不同类型的结果
        if (Array.isArray(result)) {
            // 如果是数组，可能是多个content块
            formattedContent = result.map(item => {
                if (item.type === 'text') {
                    return item.text;
                } else if (item.type === 'resource') {
                    return `[资源: ${item.resource}]`;
                } else {
                    return JSON.stringify(item, null, 2);
                }
            }).join('\n');
        } else if (typeof result === 'object' && result !== null) {
            // 处理对象结果，特别是MCP响应格式
            if (result.content && Array.isArray(result.content)) {
                formattedContent = result.content.map(item => {
                    if (item.type === 'text') {
                        return item.text;
                    } else if (item.type === 'resource') {
                        return `[资源: ${item.resource}]`;
                    } else {
                        return JSON.stringify(item, null, 2);
                    }
                }).join('\n');
            } else {
                // 普通对象
                formattedContent = JSON.stringify(result, null, 2);
            }
        } else if (typeof result === 'string') {
            formattedContent = result;
        } else {
            formattedContent = String(result);
        }
        
        // 限制长度
        if (formattedContent.length > MAX_RESULT_LENGTH) {
            formattedContent = formattedContent.substring(0, MAX_RESULT_LENGTH) + '\n\n[结果已截断...]';
        }
        
        return `🔧 **${toolName}工具结果**\n${formattedContent}`;
    }

    // 生成带工具调用的提示
    async enhanceMessageWithTools(message) {
        console.log('[MCP-DEBUG] 开始增强消息:', message.substring(0, 100) + '...');
        
        const toolSuggestions = await this.analyzeMessageForTools(message);
        
        if (!toolSuggestions || toolSuggestions.length === 0) {
            console.log('[MCP-DEBUG] 没有工具建议，返回原消息');
            return { message, toolsUsed: [] };
        }

        console.log('[MCP-DEBUG] 收到', toolSuggestions.length, '个工具建议');
        
        let enhancedMessage = message;
        const toolsUsed = [];

        // 降低自动调用的阈值，提高工具使用率
        for (const suggestion of toolSuggestions) {
            console.log('[MCP-DEBUG] 评估工具建议:', {
                tool: suggestion.tool.name,
                confidence: suggestion.confidence,
                threshold: 0.5
            });
            
            if (suggestion.confidence > 0.5) { // 从0.8降到0.5
                try {
                    console.log('[MCP-DEBUG] 信心度超过阈值，尝试调用工具:', suggestion.tool.name);
                    const parameters = this.extractParametersFromMessage(message, suggestion.tool);
                    console.log('[MCP-DEBUG] 提取的工具参数:', parameters);
                    
                    console.log('[MCP-DEBUG] 开始调用工具...');
                    const result = await this.callTool(suggestion.tool.name, parameters);
                    console.log('[MCP-DEBUG] 工具调用成功，结果长度:', 
                        typeof result === 'string' ? result.length : JSON.stringify(result).length);
                    
                    const formattedResult = this.formatToolResult(suggestion.tool.name, result);
                    enhancedMessage += `\n\n${formattedResult}`;
                    
                    toolsUsed.push({
                        name: suggestion.tool.name,
                        parameters,
                        result
                    });
                    
                    console.log('[MCP-DEBUG] 工具', suggestion.tool.name, '调用完成并添加到结果');
                } catch (error) {
                    console.error('[MCP-ERROR] 工具调用失败:', {
                        tool: suggestion.tool.name,
                        error: error.message,
                        stack: error.stack
                    });
                    // 添加错误信息到消息中
                    enhancedMessage += `\n\n⚠️ **工具调用失败 (${suggestion.tool.name})**\n错误: ${error.message}`;
                }
            } else {
                console.log('[MCP-DEBUG] 信心度不足，跳过工具:', suggestion.tool.name, '(', suggestion.confidence, ')');
            }
        }

        console.log('[MCP-DEBUG] 消息增强完成，使用了', toolsUsed.length, '个工具');
        console.log('[MCP-DEBUG] 增强后消息长度:', enhancedMessage.length);
        
        return { message: enhancedMessage, toolsUsed };
    }

    // 从消息中提取工具参数
    extractParametersFromMessage(message, tool) {
        const parameters = {};
        console.log('[MCP-DEBUG] 为工具提取参数:', tool.name, '来自消息:', message.substring(0, 100));

        // 基于工具类型提取参数
        if (tool.name.includes('search') || tool.name.includes('brave_search')) {
            // 搜索工具参数提取
            const searchQuery = message
                .replace(/搜索|查找|search|find|请|帮我|告诉我/gi, '')
                .replace(/的信息|资料|内容/gi, '')
                .trim();
            
            parameters.query = searchQuery || message;
            console.log('[MCP-DEBUG] 提取搜索查询:', parameters.query);
        }
        
        else if (tool.name.includes('read') && tool.inputSchema?.properties) {
            // 文件读取工具
            if (tool.inputSchema.properties.path) {
                // 尝试提取文件路径
                const pathMatch = message.match(/["']([^"']+)["']|(\S+\.\w+)/);
                if (pathMatch) {
                    parameters.path = pathMatch[1] || pathMatch[2];
                } else {
                    // 如果没有明确路径，使用当前目录
                    parameters.path = './';
                }
                console.log('[MCP-DEBUG] 提取文件路径:', parameters.path);
            }
        }
        
        else if (tool.name.includes('list') && tool.inputSchema?.properties) {
            // 文件列表工具
            if (tool.inputSchema.properties.path) {
                parameters.path = './';
                console.log('[MCP-DEBUG] 设置列表路径:', parameters.path);
            }
        }
        
        else if (tool.name.includes('git') && tool.inputSchema?.properties) {
            // Git工具
            if (message.includes('状态') || message.includes('status')) {
                parameters.command = 'status';
            } else if (message.includes('日志') || message.includes('log')) {
                parameters.command = 'log';
                parameters.options = ['--oneline', '-10'];
            } else {
                parameters.command = 'status'; // 默认
            }
            console.log('[MCP-DEBUG] 提取Git命令:', parameters);
        }

        // 如果工具有输入模式定义，尝试智能填充缺失的必需参数
        if (tool.inputSchema?.required && Array.isArray(tool.inputSchema.required)) {
            tool.inputSchema.required.forEach(requiredParam => {
                if (!parameters[requiredParam]) {
                    // 为必需参数提供合理的默认值
                    switch (requiredParam) {
                        case 'query':
                            parameters[requiredParam] = message;
                            break;
                        case 'path':
                            parameters[requiredParam] = './';
                            break;
                        case 'command':
                            parameters[requiredParam] = 'help';
                            break;
                        default:
                            parameters[requiredParam] = '';
                    }
                    console.log('[MCP-DEBUG] 设置必需参数默认值:', requiredParam, '=', parameters[requiredParam]);
                }
            });
        }

        console.log('[MCP-DEBUG] 最终提取的参数:', parameters);
        return parameters;
    }

    // 保存MCP配置
    async saveMCPConfig() {
        try {
            // 将Map转换为对象格式，只保存导入的服务器
            const importedServers = {};
            for (const [name, server] of this.mcpServers.entries()) {
                if (server.imported) {
                    // 只保存配置信息，不保存运行时状态
                    if (server.type === 'streamable-http') {
                        importedServers[name] = {
                            type: server.type,
                            url: server.url,
                            headers: server.headers || {},
                            description: server.description
                        };
                    } else {
                        importedServers[name] = {
                            command: server.command,
                            args: server.args || [],
                            env: server.env || {},
                            description: server.description
                        };
                    }
                }
            }
            
            const config = {
                mcpBridgeUrl: this.bridgeUrl,
                mcpServers: importedServers
            };
            
            console.log('[MCP-DEBUG] 保存MCP配置:', config);
            await chrome.storage.sync.set(config);
        } catch (error) {
            console.error('Failed to save MCP config:', error);
        }
    }

    // 获取桥接服务器状态
    getBridgeStatus() {
        const status = {
            connected: this.bridgeConnected,
            url: this.bridgeUrl,
            servers: this.mcpServers.size,
            tools: this.availableTools.size
        };
        console.log('[MCP-DEBUG] 获取桥接状态:', status);
        return status;
    }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MCPService;
}