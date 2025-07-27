chrome.runtime.onInstalled.addListener(() => {
    console.log('Simple AI Copilot installed');
});

chrome.action.onClicked.addListener(async (tab) => {
    try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
    } catch (error) {
        console.error('Failed to open side panel:', error);
    }
});

// MCP服务器管理
const mcpServers = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // 保持消息通道开放以支持异步响应
});

async function handleMessage(message, sender, sendResponse) {
    try {
        switch (message.action) {
            case 'openSettings':
                // 不需要转发消息，因为popup.js已经直接向侧边栏发送消息
                // 只需要确认收到消息
                sendResponse({ success: true });
                break;

            // 新增MCP桥接代理功能
            case 'mcpBridgeRequest':
                const bridgeResult = await handleMCPBridgeRequest(message.url, message.options);
                sendResponse(bridgeResult);
                break;

            case 'connectMCPServer':
                const connectResult = await connectMCPServer(message.serverName, message.config);
                sendResponse(connectResult);
                break;

            case 'disconnectMCPServer':
                const disconnectResult = await disconnectMCPServer(message.serverName);
                sendResponse(disconnectResult);
                break;

            case 'callMCPTool':
                const toolResult = await callMCPTool(message.serverName, message.toolName, message.parameters);
                sendResponse(toolResult);
                break;

            default:
                sendResponse({ success: false, error: 'Unknown action' });
        }
    } catch (error) {
        console.error('Message handling error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// MCP桥接代理函数 - 从background script发送请求避免CSP限制
async function handleMCPBridgeRequest(url, options = {}) {
    console.log('[BACKGROUND] 代理MCP桥接请求:', url);
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body || undefined
        });

        const data = await response.json();
        
        console.log('[BACKGROUND] 桥接请求成功:', {
            url,
            status: response.status,
            ok: response.ok
        });

        return {
            success: true,
            data,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        };
    } catch (error) {
        console.error('[BACKGROUND] 桥接请求失败:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// MCP服务器连接函数
async function connectMCPServer(serverName, config) {
    try {
        // 在浏览器环境中，我们无法直接启动Node.js进程
        // 这里提供一个模拟实现，实际应用中需要通过Native Messaging或其他方式
        
        // 模拟连接成功并返回一些示例工具
        const mockTools = getMockToolsForServer(serverName);
        
        mcpServers.set(serverName, {
            config,
            status: 'connected',
            tools: mockTools,
            connectedAt: Date.now()
        });

        return {
            success: true,
            tools: mockTools,
            message: `Successfully connected to ${serverName}`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function disconnectMCPServer(serverName) {
    try {
        if (mcpServers.has(serverName)) {
            mcpServers.delete(serverName);
            return {
                success: true,
                message: `Disconnected from ${serverName}`
            };
        }
        
        return {
            success: false,
            error: 'Server not found'
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

async function callMCPTool(serverName, toolName, parameters) {
    try {
        const server = mcpServers.get(serverName);
        if (!server) {
            throw new Error(`Server ${serverName} not connected`);
        }

        // 模拟工具调用
        const result = await simulateToolCall(toolName, parameters);
        
        return {
            success: true,
            result
        };
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// 获取模拟工具列表
function getMockToolsForServer(serverName) {
    const toolMap = {
        'filesystem': [
            {
                name: 'read_file',
                description: '读取文件内容',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '文件路径' }
                    },
                    required: ['path']
                }
            },
            {
                name: 'list_directory',
                description: '列出目录内容',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '目录路径' }
                    },
                    required: ['path']
                }
            }
        ],
        'web-search': [
            {
                name: 'search',
                description: '搜索网络内容',
                inputSchema: {
                    type: 'object',
                    properties: {
                        query: { type: 'string', description: '搜索查询' }
                    },
                    required: ['query']
                }
            }
        ],
        'git': [
            {
                name: 'git_status',
                description: '获取Git状态',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string', description: '仓库路径' }
                    }
                }
            }
        ]
    };

    return toolMap[serverName] || [];
}

// 模拟工具调用
async function simulateToolCall(toolName, parameters) {
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 500));

    switch (toolName) {
        case 'read_file':
            return {
                content: `模拟文件内容: ${parameters.path}`,
                size: 1024,
                lastModified: new Date().toISOString()
            };

        case 'list_directory':
            return {
                files: [
                    { name: 'file1.txt', type: 'file', size: 512 },
                    { name: 'folder1', type: 'directory' },
                    { name: 'file2.js', type: 'file', size: 2048 }
                ],
                path: parameters.path
            };

        case 'search':
            return {
                results: [
                    {
                        title: `搜索结果: ${parameters.query}`,
                        url: 'https://example.com',
                        snippet: '这是一个模拟的搜索结果'
                    }
                ],
                query: parameters.query
            };

        case 'git_status':
            return {
                branch: 'main',
                staged: [],
                unstaged: ['modified: file.js'],
                untracked: ['new-file.txt']
            };

        default:
            throw new Error(`Unknown tool: ${toolName}`);
    }
}