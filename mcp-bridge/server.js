#!/usr/bin/env node

/**
 * MCP HTTP Bridge Server
 * 提供HTTP接口来与MCP服务器通信，供Chrome扩展使用
 */

const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class MCPBridge extends EventEmitter {
    constructor() {
        super();
        this.app = express();
        this.port = 3001;
        this.mcpServers = new Map();
        this.setupExpress();
    }

    setupExpress() {
        this.app.use(cors());
        this.app.use(express.json());

        // 获取可用的MCP服务器列表
        this.app.get('/api/mcp/servers', (req, res) => {
            const servers = Array.from(this.mcpServers.entries()).map(([name, server]) => ({
                name,
                status: server.status,
                description: server.description,
                tools: server.tools || []
            }));
            res.json({ servers });
        });

        // 启动MCP服务器
        this.app.post('/api/mcp/servers/:name/connect', async (req, res) => {
            try {
                const { name } = req.params;
                const { command, args, description, type, url, headers } = req.body;
                
                const result = await this.connectMCPServer(name, { 
                    command, 
                    args, 
                    description, 
                    type, 
                    url, 
                    headers 
                });
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 断开MCP服务器
        this.app.post('/api/mcp/servers/:name/disconnect', async (req, res) => {
            try {
                const { name } = req.params;
                await this.disconnectMCPServer(name);
                res.json({ success: true, message: `Disconnected from ${name}` });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 调用MCP工具
        this.app.post('/api/mcp/tools/:serverName/:toolName', async (req, res) => {
            try {
                const { serverName, toolName } = req.params;
                const { parameters = {} } = req.body;
                
                const result = await this.callTool(serverName, toolName, parameters);
                res.json(result);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // 健康检查
        this.app.get('/api/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });
    }

    async connectMCPServer(name, config) {
        try {
            console.log(`Connecting to MCP server: ${name}`);
            
            const server = {
                name,
                description: config.description || '',
                status: 'connecting',
                tools: [],
                requests: new Map()
            };

            if (config.type === 'streamable-http') {
                // HTTP类型MCP服务器
                server.type = 'streamable-http';
                server.url = config.url;
                server.headers = config.headers || {};
                
                // 测试HTTP连接
                await this.testHttpConnection(server);
                await this.initializeHttpMCPServer(server);
            } else {
                // 进程类型MCP服务器
                server.type = 'process';
                server.command = config.command;
                server.args = config.args;
                
                // 启动进程
                const safeArgs = config.args || [];
                console.log(`Spawning process: ${config.command} ${safeArgs.join(' ')}`);
                console.log(`Working directory: ${process.cwd()}`);
                console.log(`Environment PATH: ${process.env.PATH}`);
                
                // 修复Windows上的命令执行问题
                let command = config.command;
                let args = [...safeArgs]; // 创建参数的副本
                let options = {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: 'C:\\Users\\HuChen\\Projects\\simple-ai-copilot', // 使用绝对路径
                    env: { ...process.env, ...(config.env || {}) }
                };
                
                console.log('Environment variables for', name, ':', config.env || 'none');

                if (process.platform === 'win32') {
                    // 在Windows上，使用node直接执行MCP服务器
                    if (command === 'npx') {
                        // 使用node直接执行已安装的MCP包
                        const nodePath = 'C:\\Users\\HuChen\\scoop\\apps\\nvm\\current\\nodejs\\nodejs\\node.exe';
                        const mcpPackage = args[0]; // @modelcontextprotocol/server-filesystem
                        const mcpArgs = args.slice(1); // 剩余参数
                        
                        // 构建MCP包路径映射
                        const mcpPackageMap = {
                            '@modelcontextprotocol/server-filesystem': 'server-filesystem/dist/index.js',
                            '@modelcontextprotocol/server-brave-search': 'server-brave-search/dist/index.js',
                            '@modelcontextprotocol/server-git': 'server-git/dist/index.js',
                            '@modelcontextprotocol/server-sqlite': 'server-sqlite/dist/index.js'
                        };
                        
                        if (mcpPackageMap[mcpPackage]) {
                            command = nodePath;
                            const packagePath = `C:\\Users\\HuChen\\Projects\\simple-ai-copilot\\node_modules\\@modelcontextprotocol\\${mcpPackageMap[mcpPackage]}`;
                            args = [packagePath, ...mcpArgs];
                            console.log(`Using direct node execution: ${command} ${args.join(' ')}`);
                            
                            // 验证文件是否存在
                            try {
                                require('fs').accessSync(packagePath);
                                console.log(`Package file exists: ${packagePath}`);
                            } catch (e) {
                                console.error(`Package file NOT found: ${packagePath}`);
                                console.error('Error:', e.message);
                                // 如果包文件不存在，回退到npx
                                command = 'cmd.exe';
                                args = ['/c', 'npx', mcpPackage, ...mcpArgs];
                                console.log(`Falling back to npx: ${command} ${args.join(' ')}`);
                            }
                            
                            // 验证node路径是否存在
                            try {
                                require('fs').accessSync(nodePath);
                                console.log(`Node executable exists: ${nodePath}`);
                            } catch (e) {
                                console.error(`Node executable NOT found: ${nodePath}`);
                                console.error('Error:', e.message);
                                // 如果node不存在，回退到npx
                                command = 'cmd.exe';
                                args = ['/c', 'npx', mcpPackage, ...mcpArgs];
                                console.log(`Falling back to npx: ${command} ${args.join(' ')}`);
                            }
                        } else {
                            // 对于未知包，使用npx
                            command = 'cmd.exe';
                            args = ['/c', 'npx', mcpPackage, ...mcpArgs];
                            console.log(`Using npx for unknown package: ${command} ${args.join(' ')}`);
                        }
                    }
                    options.shell = false;
                } else {
                    // 在非Windows系统上，可能需要shell来解析命令
                    options.shell = true;
                }
                
                console.log(`Final command: ${command}`);
                console.log(`Final args:`, JSON.stringify(args));
                console.log(`Options:`, JSON.stringify(options, null, 2));
                
                // 验证参数有效性
                if (!command || typeof command !== 'string') {
                    console.error('Invalid command detected:', { command, type: typeof command, config });
                    throw new Error(`Invalid command: ${command}. Config received: ${JSON.stringify(config)}`);
                }
                
                if (!Array.isArray(args)) {
                    throw new Error(`Invalid args (not array): ${args}`);
                }
                
                // 检查每个参数
                for (let i = 0; i < args.length; i++) {
                    if (typeof args[i] !== 'string') {
                        throw new Error(`Invalid arg at index ${i}: ${args[i]} (type: ${typeof args[i]})`);
                    }
                }
                
                console.log(`About to spawn: command="${command}", args=${JSON.stringify(args)}`);
                
                const childProcess = spawn(command, args, options);
                server.process = childProcess;
                
                // 添加进程错误处理
                childProcess.on('error', (error) => {
                    console.error(`Process spawn error for ${name}:`, error);
                    console.error(`Command that failed: ${command}`);
                    console.error(`Args that failed:`, JSON.stringify(args));
                    console.error(`Options used:`, JSON.stringify(options, null, 2));
                    server.status = 'error';
                    
                    // 提供具体的错误建议
                    if (error.code === 'ENOENT') {
                        console.error(`Command not found. Try checking if '${command}' is installed and in PATH.`);
                    } else if (error.code === 'EINVAL') {
                        console.error(`Invalid arguments. Check command syntax and argument types.`);
                    }
                });
                
                childProcess.on('exit', (code, signal) => {
                    console.log(`Process ${name} exited with code ${code}, signal ${signal}`);
                });
                
                // 设置进程通信
                this.setupMCPCommunication(server);
                
                // 等待进程启动  
                await this.waitForProcessReady(server);
                
                // 初始化连接
                await this.initializeMCPServer(server);
            }

            this.mcpServers.set(name, server);
            server.status = 'connected';
            console.log(`Successfully connected to MCP server: ${name}`);

            return {
                success: true,
                message: `Connected to ${name}`,
                tools: server.tools
            };

        } catch (error) {
            console.error(`Failed to connect to MCP server ${name}:`, error);
            throw error;
        }
    }

    setupMCPCommunication(server) {
        let buffer = '';

        server.process.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[${server.name}] stdout:`, output.trim());
            buffer += output;
            
            // 按行处理JSON-RPC消息
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 保留最后一个不完整的行

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const message = JSON.parse(line.trim());
                        this.handleMCPMessage(server, message);
                    } catch (error) {
                        console.error(`[${server.name}] Failed to parse MCP message:`, error.message);
                        console.error(`[${server.name}] Raw line:`, line.trim());
                    }
                }
            }
        });

        server.process.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            console.error(`[${server.name}] stderr:`, errorOutput.trim());
            
            // 检查常见错误模式
            if (errorOutput.includes('ENOENT')) {
                console.error(`[${server.name}] Command not found - check if the command exists in PATH`);
            } else if (errorOutput.includes('permission denied')) {
                console.error(`[${server.name}] Permission denied - check file permissions`);
            } else if (errorOutput.includes('Module not found')) {
                console.error(`[${server.name}] NPM module not found - try running 'npm install'`);
            }
        });

        server.process.on('close', (code) => {
            console.log(`[${server.name}] Process exited with code ${code}`);
            server.status = 'disconnected';
            
            // 提供退出代码的含义
            if (code === 1) {
                console.error(`[${server.name}] Exit code 1 usually indicates a general error`);
            } else if (code === 126) {
                console.error(`[${server.name}] Exit code 126 indicates command cannot be executed`);
            } else if (code === 127) {
                console.error(`[${server.name}] Exit code 127 indicates command not found`);
            }
        });
    }

    async testHttpConnection(server) {
        try {
            const response = await fetch(server.url, {
                method: 'OPTIONS',
                headers: server.headers
            });
            
            if (!response.ok && response.status !== 404) {
                throw new Error(`HTTP server not accessible: ${response.status}`);
            }
        } catch (error) {
            if (error.code === 'ECONNREFUSED') {
                throw new Error(`Cannot connect to ${server.url} - server not running`);
            }
            throw error;
        }
    }

    async initializeHttpMCPServer(server) {
        try {
            // 发送初始化请求到HTTP MCP服务器
            const initResult = await this.sendHttpMCPRequest(server, 'initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'simple-ai-copilot',
                    version: '1.0.0'
                }
            });

            console.log(`HTTP MCP server ${server.name} initialized:`, initResult);

            // 获取工具列表
            const toolsResult = await this.sendHttpMCPRequest(server, 'tools/list');
            server.tools = toolsResult.tools || [];

            console.log(`HTTP MCP server ${server.name} tools:`, server.tools.map(t => t.name));

        } catch (error) {
            console.error(`Failed to initialize HTTP MCP server ${server.name}:`, error);
            throw error;
        }
    }

    async sendHttpMCPRequest(server, method, params = {}) {
        try {
            const request = {
                jsonrpc: '2.0',
                id: Date.now().toString(),
                method,
                params
            };

            const response = await fetch(server.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...server.headers
                },
                body: JSON.stringify(request)
            });

            if (!response.ok) {
                throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error.message || 'HTTP MCP error');
            }

            return result.result;

        } catch (error) {
            throw new Error(`HTTP MCP request failed: ${error.message}`);
        }
    }

    handleMCPMessage(server, message) {
        console.log(`Received message from ${server.name}:`, JSON.stringify(message));
        
        if (message.id && server.requests.has(message.id)) {
            // 这是对请求的响应
            const { resolve, reject } = server.requests.get(message.id);
            server.requests.delete(message.id);

            if (message.error) {
                console.error(`MCP error from ${server.name}:`, message.error);
                reject(new Error(message.error.message || JSON.stringify(message.error)));
            } else {
                console.log(`MCP success from ${server.name}:`, message.result);
                resolve(message.result);
            }
        } else if (message.method) {
            // 这是服务器发送的通知或请求
            console.log(`MCP notification from ${server.name}:`, message.method, message.params);
        } else {
            console.warn(`Unhandled message from ${server.name}:`, message);
        }
    }

    async sendMCPRequest(server, method, params = {}) {
        return new Promise((resolve, reject) => {
            if (!server.process || server.process.killed) {
                reject(new Error(`MCP server ${server.name} process is not running`));
                return;
            }

            const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            const request = {
                jsonrpc: '2.0',
                id,
                method,
                params
            };

            console.log(`Sending MCP request to ${server.name}:`, JSON.stringify(request));

            server.requests.set(id, { resolve, reject });

            // 设置超时
            const timeout = setTimeout(() => {
                if (server.requests.has(id)) {
                    server.requests.delete(id);
                    reject(new Error(`Request timeout for method ${method} on server ${server.name}`));
                }
            }, 10000); // 减少超时时间到10秒

            // 清理超时
            const originalResolve = resolve;
            const originalReject = reject;
            
            server.requests.set(id, { 
                resolve: (result) => {
                    clearTimeout(timeout);
                    originalResolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    originalReject(error);
                }
            });

            try {
                server.process.stdin.write(JSON.stringify(request) + '\n');
            } catch (error) {
                server.requests.delete(id);
                clearTimeout(timeout);
                reject(new Error(`Failed to write to MCP server ${server.name}: ${error.message}`));
            }
        });
    }

    async initializeMCPServer(server) {
        try {
            // 等待进程启动
            console.log(`Waiting for MCP server ${server.name} to start...`);
            await this.waitForProcessReady(server);
            
            console.log(`Sending initialize request to ${server.name}...`);
            // 发送初始化请求
            const initResult = await this.sendMCPRequest(server, 'initialize', {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                    name: 'simple-ai-copilot',
                    version: '1.0.0'
                }
            });

            console.log(`MCP server ${server.name} initialized:`, initResult);

            console.log(`Requesting tools list from ${server.name}...`);
            // 获取工具列表
            const toolsResult = await this.sendMCPRequest(server, 'tools/list');
            server.tools = toolsResult.tools || [];

            console.log(`MCP server ${server.name} tools:`, server.tools.map(t => t.name));

        } catch (error) {
            console.error(`Failed to initialize MCP server ${server.name}:`, error);
            throw error;
        }
    }

    async waitForProcessReady(server, timeout = 15000) { // 增加到15秒用于确保稳定连接
        return new Promise((resolve, reject) => {
            let isReady = false;
            let hasOutput = false;
            let outputCount = 0;
            
            console.log(`[${server.name}] Waiting for process to be ready (timeout: ${timeout}ms)...`);
            
            const timer = setTimeout(() => {
                if (!isReady) {
                    const message = hasOutput 
                        ? `Process ${server.name} had ${outputCount} outputs but no clear ready signal within ${timeout}ms`
                        : `Process ${server.name} failed to produce any output within ${timeout}ms`;
                    console.error(`[${server.name}] ${message}`);
                    reject(new Error(message));
                }
            }, timeout);

            // 监听进程输出，判断是否准备就绪
            const checkReady = (data, source = 'stdout') => {
                const output = data.toString();
                hasOutput = true;
                outputCount++;
                
                console.log(`[${server.name}] ${source} #${outputCount}:`, JSON.stringify(output));
                
                // 检查MCP服务器的启动标志 - 更宽松的匹配
                if (output.includes('running') || 
                    output.includes('Server') || 
                    output.includes('ready') ||
                    output.includes('listening') ||
                    output.includes('started') ||
                    output.includes('Secure MCP') ||
                    output.includes('MCP') ||
                    output.includes('stdio')) { // 更宽松的匹配
                    isReady = true;
                    clearTimeout(timer);
                    server.process.stdout.removeListener('data', checkReady);
                    server.process.stderr.removeListener('data', checkReadyStderr);
                    console.log(`[${server.name}] Process ready! Detected keyword in ${source}: ${JSON.stringify(output)}`);
                    resolve();
                }
            };
            
            const checkReadyStderr = (data) => checkReady(data, 'stderr');

            server.process.stdout.on('data', checkReady);
            server.process.stderr.on('data', checkReadyStderr);
            
            // 更短的最小等待时间，如果有任何输出就假设就绪
            setTimeout(() => {
                if (hasOutput && !isReady) {
                    isReady = true;
                    clearTimeout(timer);
                    server.process.stdout.removeListener('data', checkReady);
                    console.log(`[${server.name}] Assuming ready after 1s wait (had ${outputCount} outputs)`);
                    resolve();
                }
            }, 1000); // 1秒后如果有输出就假设就绪
            
            // 如果进程立即失败
            server.process.on('error', (error) => {
                if (!isReady) {
                    clearTimeout(timer);
                    console.error(`[${server.name}] Process error during startup:`, error);
                    reject(error);
                }
            });
            
            // 如果进程退出
            server.process.on('exit', (code) => {
                if (!isReady) {
                    clearTimeout(timer);
                    const message = `Process ${server.name} exited with code ${code} before ready (had ${outputCount} outputs)`;
                    console.error(`[${server.name}] ${message}`);
                    reject(new Error(message));
                }
            });
        });
    }

    async callTool(serverName, toolName, parameters) {
        const server = this.mcpServers.get(serverName);
        if (!server || server.status !== 'connected') {
            throw new Error(`MCP server ${serverName} not connected`);
        }

        try {
            if (server.type === 'streamable-http') {
                // HTTP类型工具调用
                const result = await this.sendHttpMCPRequest(server, 'tools/call', {
                    name: toolName,
                    arguments: parameters
                });
                return {
                    success: true,
                    result: result.content || result
                };
            } else {
                // 进程类型工具调用
                const result = await this.sendMCPRequest(server, 'tools/call', {
                    name: toolName,
                    arguments: parameters
                });
                return {
                    success: true,
                    result: result.content || result
                };
            }
        } catch (error) {
            throw new Error(`Tool call failed: ${error.message}`);
        }
    }

    async disconnectMCPServer(name) {
        const server = this.mcpServers.get(name);
        if (!server) return;

        try {
            if (server.process && !server.process.killed) {
                server.process.kill();
            }
            this.mcpServers.delete(name);
        } catch (error) {
            console.error(`Error disconnecting MCP server ${name}:`, error);
        }
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`MCP Bridge Server running on http://localhost:${this.port}`);
            console.log('Ready to connect Chrome extension to MCP servers');
        });
    }

    stop() {
        // 关闭所有MCP服务器
        for (const [name, server] of this.mcpServers) {
            this.disconnectMCPServer(name);
        }
    }
}

// 启动桥接服务器
if (require.main === module) {
    const bridge = new MCPBridge();
    bridge.start();

    // 优雅退出
    process.on('SIGINT', () => {
        console.log('Shutting down MCP Bridge Server...');
        bridge.stop();
        process.exit(0);
    });
}

module.exports = MCPBridge;