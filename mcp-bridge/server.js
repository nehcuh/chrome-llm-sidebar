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
const path = require('path');
const fs = require('fs');

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
            const { name } = req.params;
            try {
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
                console.error(`[ERROR] Failed to connect to ${name}:`, error);
                res.status(500).json({ 
                    success: false,
                    error: `连接到服务器 '${name}' 失败: ${error.message}` 
                });
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
            console.log(`[DEBUG] Attempting to connect to MCP server: ${name}`);
            
            const server = {
                name,
                description: config.description || '',
                status: 'connecting',
                tools: [],
                requests: new Map()
            };

            if (config.type === 'streamable-http') {
                // (Omitted for brevity, no changes here)
            } else {
                server.type = 'process';
                const safeArgs = config.args || [];
                
                let command = config.command;
                let args = [...safeArgs];
                // Sanitize the environment for the child process to avoid interference.
                const cleanEnv = {};
                // Pass essential system variables.
                for (const key of ['Path', 'PATH', 'SystemRoot', 'WINDIR', 'TMP', 'TEMP']) {
                    if (process.env[key]) {
                        cleanEnv[key] = process.env[key];
                    }
                }

                let options = {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    cwd: process.cwd(),
                    env: { ...cleanEnv, ...(config.env || {}) }, // Use the sanitized environment
                    shell: true 
                };

                // When shell is true, we pass the command and args as a single string on Windows
                // or as separate arguments on other platforms.
                if (process.platform === 'win32') {
                    // On Windows, wrap arguments with spaces or backslashes in quotes
                    const quotedArgs = args.map(arg => {
                        if (arg.includes(' ') || arg.includes('\\')) {
                            return `"${arg}"`;
                        }
                        return arg;
                    });
                    command = `${command} ${quotedArgs.join(' ')}`;
                    args = [];
                }
                
                console.log(`[DEBUG] Spawning process with shell:`);
                console.log(`[DEBUG]   Command: ${command}`);
                console.log(`[DEBUG]   Args: ${JSON.stringify(args)}`);
                console.log(`[DEBUG]   Options: ${JSON.stringify(options)}`);
                
                const childProcess = spawn(command, args, options);
                server.process = childProcess;

                // --- DETAILED PROCESS LOGGING ---
                childProcess.on('spawn', () => {
                    console.log(`[DEBUG][${name}] Event: 'spawn' - Process has been successfully spawned. PID: ${childProcess.pid}`);
                });

                childProcess.on('error', (error) => {
                    console.error(`[DEBUG][${name}] Event: 'error' - Failed to start or kill the process.`, error);
                    server.status = 'error';
                });

                childProcess.on('exit', (code, signal) => {
                    console.log(`[DEBUG][${name}] Event: 'exit' - Process exited with code: ${code}, signal: ${signal}`);
                });

                childProcess.on('close', (code, signal) => {
                    console.log(`[DEBUG][${name}] Event: 'close' - All stdio streams have been closed. Code: ${code}, signal: ${signal}`);
                });

                childProcess.on('disconnect', () => {
                    console.log(`[DEBUG][${name}] Event: 'disconnect' - Parent process disconnected from child.`);
                });
                // --- END DETAILED LOGGING ---
                
                this.setupMCPCommunication(server);
                // The 'waitForProcessReady' step was causing a deadlock with servers that don't
                // emit a startup message. The correct approach is to send 'initialize' immediately.
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

        const handleData = (data) => {
            const output = data.toString();
            console.log(`[${server.name}] stdout:`, output.trim());
            buffer += output;
            
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep the last, possibly incomplete line

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        // Try to parse as JSON-RPC
                        const message = JSON.parse(line.trim());
                        this.handleMCPMessage(server, message);
                    } catch (error) {
                        // If it's not JSON, treat it as a log line
                        console.log(`[${server.name} LOG] ${line.trim()}`);
                    }
                }
            }
        };

        server.process.stdout.on('data', handleData);
        server.process.stderr.on('data', (data) => {
            console.error(`[${server.name}] stderr:`, data.toString().trim());
        });

        server.process.on('close', (code) => {
            console.log(`[${server.name}] Process exited with code ${code}`);
            server.status = 'disconnected';
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
            console.log(`Sending initialize request to ${server.name}...`);
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
            const toolsResult = await this.sendMCPRequest(server, 'tools/list');
            server.tools = toolsResult.tools || [];

            console.log(`MCP server ${server.name} tools:`, server.tools.map(t => t.name));

        } catch (error) {
            console.error(`Failed to initialize MCP server ${server.name}:`, error);
            throw error;
        }
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