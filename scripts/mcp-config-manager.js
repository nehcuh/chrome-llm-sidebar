/**
 * MCP Configuration Manager
 * 处理MCP配置的导入、导出、验证等功能
 */
class MCPConfigManager {
    constructor() {
        this.defaultTemplate = this.getDefaultTemplate();
        this.sampleConfigs = this.getSampleConfigs();
    }

    // 获取默认配置模板
    getDefaultTemplate() {
        return {
            "mcpServers": {
                "filesystem": {
                    "command": "npx",
                    "args": ["@modelcontextprotocol/server-filesystem", "./"],
                    "env": {},
                    "description": "文件系统操作工具"
                },
                "git": {
                    "command": "npx", 
                    "args": ["@modelcontextprotocol/server-git", "./"],
                    "env": {},
                    "description": "Git版本控制工具"
                },
                "brave-search": {
                    "command": "npx",
                    "args": ["@modelcontextprotocol/server-brave-search"],
                    "env": {
                        "BRAVE_API_KEY": "your-brave-api-key"
                    },
                    "description": "网络搜索工具"
                },
                "sqlite": {
                    "command": "npx",
                    "args": ["@modelcontextprotocol/server-sqlite", "./database.db"],
                    "env": {},
                    "description": "SQLite数据库工具"
                },
                "streamable-example": {
                    "type": "streamable-http",
                    "url": "http://127.0.0.1:12306/mcp",
                    "description": "HTTP流式MCP服务器示例"
                },
                "sse-example": {
                    "type": "sse",
                    "url": "http://localhost:3000/sse",
                    "reconnectInterval": 5000,
                    "description": "SSE流式MCP服务器示例"
                }
            }
        };
    }

    // 获取示例配置
    getSampleConfigs() {
        return {
            "基础配置": {
                "mcpServers": {
                    "filesystem": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-filesystem", "./"],
                        "description": "文件系统操作"
                    },
                    "git": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-git", "./"],
                        "description": "Git版本控制"
                    }
                }
            },
            "开发者配置": {
                "mcpServers": {
                    "filesystem": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-filesystem", "./"],
                        "description": "文件系统操作"
                    },
                    "git": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-git", "./"],
                        "description": "Git版本控制"
                    },
                    "sqlite": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-sqlite", "./app.db"],
                        "description": "应用数据库"
                    },
                    "brave-search": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-brave-search"],
                        "env": {
                            "BRAVE_API_KEY": "YOUR_API_KEY_HERE"
                        },
                        "description": "网络搜索"
                    }
                }
            },
            "数据分析配置": {
                "mcpServers": {
                    "filesystem": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-filesystem", "./data"],
                        "description": "数据文件访问"
                    },
                    "sqlite": {
                        "command": "npx",
                        "args": ["@modelcontextprotocol/server-sqlite", "./analytics.db"],
                        "description": "分析数据库"
                    },
                    "python": {
                        "command": "python",
                        "args": ["-m", "mcp_server_python"],
                        "env": {
                            "PYTHON_PATH": "./scripts"
                        },
                        "description": "Python脚本执行"
                    }
                }
            },
            "HTTP服务器配置": {
                "mcpServers": {
                    "streamable-mcp-server": {
                        "type": "streamable-http",
                        "url": "http://127.0.0.1:12306/mcp",
                        "description": "HTTP流式MCP服务器"
                    },
                    "custom-api-server": {
                        "type": "streamable-http", 
                        "url": "http://localhost:8080/api/mcp",
                        "headers": {
                            "Authorization": "Bearer your-token"
                        },
                        "description": "自定义API服务器"
                    }
                }
            },
            "SSE服务器配置": {
                "mcpServers": {
                    "web-search-sse": {
                        "type": "sse",
                        "url": "http://localhost:3000/sse",
                        "reconnectInterval": 5000,
                        "description": "SSE网络搜索服务"
                    },
                    "realtime-data-sse": {
                        "type": "sse",
                        "url": "http://localhost:4000/events",
                        "headers": {
                            "Authorization": "Bearer your-token"
                        },
                        "reconnectInterval": 3000,
                        "description": "实时数据SSE服务"
                    }
                }
            }
        };
    }

    // 验证配置格式
    validateConfig(configJson) {
        try {
            const config = JSON.parse(configJson);
            const errors = [];
            const warnings = [];

            // 检查根结构
            if (!config.mcpServers || typeof config.mcpServers !== 'object') {
                errors.push('配置必须包含 "mcpServers" 对象');
                return { valid: false, errors, warnings };
            }

            // 检查每个服务器配置
            const servers = config.mcpServers;
            for (const [serverName, serverConfig] of Object.entries(servers)) {
                const serverErrors = this.validateServerConfig(serverName, serverConfig);
                errors.push(...serverErrors.errors);
                warnings.push(...serverErrors.warnings);
            }

            return {
                valid: errors.length === 0,
                errors,
                warnings,
                config: config
            };

        } catch (error) {
            return {
                valid: false,
                errors: [`JSON格式错误: ${error.message}`],
                warnings: []
            };
        }
    }

    // 验证单个服务器配置
    validateServerConfig(name, config) {
        const errors = [];
        const warnings = [];

        // 检查服务器类型
        const serverType = config.type || 'process';
        
        if (serverType === 'streamable-http' || serverType === 'sse') {
            // HTTP/SSE类型服务器验证
            if (!config.url || typeof config.url !== 'string') {
                errors.push(`服务器 "${name}": 缺少或无效的 "url" 字段`);
            } else {
                try {
                    new URL(config.url);
                } catch (e) {
                    errors.push(`服务器 "${name}": "url" 格式无效`);
                }
            }
            
            if (config.headers && typeof config.headers !== 'object') {
                warnings.push(`服务器 "${name}": "headers" 应为对象`);
            }
            
            // SSE特定验证
            if (serverType === 'sse') {
                if (config.reconnectInterval && (typeof config.reconnectInterval !== 'number' || config.reconnectInterval < 1000)) {
                    warnings.push(`服务器 "${name}": "reconnectInterval" 应为大于1000的数字（毫秒）`);
                }
            }
        } else {
            // 进程类型服务器验证（原有逻辑）
            if (!config.command || typeof config.command !== 'string') {
                errors.push(`服务器 "${name}": 缺少或无效的 "command" 字段`);
            }

            if (!config.args || !Array.isArray(config.args)) {
                warnings.push(`服务器 "${name}": "args" 应为数组`);
            }
            
            // 常见问题检查
            if (config.command === 'npx' && config.args && config.args.length > 0) {
                const packageName = config.args[0];
                if (!packageName.startsWith('@modelcontextprotocol/')) {
                    warnings.push(`服务器 "${name}": 包名 "${packageName}" 可能不是官方MCP服务器`);
                }
            }
        }

        // 通用字段验证
        if (config.env && typeof config.env !== 'object') {
            warnings.push(`服务器 "${name}": "env" 应为对象`);
        }

        if (config.description && typeof config.description !== 'string') {
            warnings.push(`服务器 "${name}": "description" 应为字符串`);
        }

        // 环境变量检查
        if (config.env) {
            for (const [key, value] of Object.entries(config.env)) {
                if (typeof value !== 'string') {
                    warnings.push(`服务器 "${name}": 环境变量 "${key}" 的值应为字符串`);
                }
                if (key.includes('API_KEY') && (value.includes('your-') || value.includes('YOUR_'))) {
                    warnings.push(`服务器 "${name}": 请替换占位符API密钥 "${key}"`);
                }
            }
        }

        // Headers检查（用于HTTP类型）
        if (config.headers) {
            for (const [key, value] of Object.entries(config.headers)) {
                if (typeof value !== 'string') {
                    warnings.push(`服务器 "${name}": 请求头 "${key}" 的值应为字符串`);
                }
                if (key.toLowerCase().includes('authorization') && (value.includes('your-') || value.includes('Bearer your-'))) {
                    warnings.push(`服务器 "${name}": 请替换占位符认证令牌`);
                }
            }
        }

        return { errors, warnings };
    }

    // 将当前服务器配置导出为JSON
    exportCurrentConfig(mcpService) {
        const config = {
            mcpServers: {}
        };

        for (const [name, server] of mcpService.mcpServers.entries()) {
                    if (server.type === 'streamable-http' && server.url) {
                        // HTTP类型服务器
                        config.mcpServers[name] = {
                            type: server.type,
                            url: server.url,
                            description: server.description || ''
                        };

                        if (server.headers && Object.keys(server.headers).length > 0) {
                            config.mcpServers[name].headers = server.headers;
                        }
                    } else if (server.type === 'sse' && server.url) {
                        // SSE类型服务器
                        config.mcpServers[name] = {
                            type: server.type,
                            url: server.url,
                            description: server.description || ''
                        };

                        if (server.headers && Object.keys(server.headers).length > 0) {
                            config.mcpServers[name].headers = server.headers;
                        }
                        
                        if (server.reconnectInterval) {
                            config.mcpServers[name].reconnectInterval = server.reconnectInterval;
                        }
                    } else if (server.command && server.args) {
                // 进程类型服务器
                config.mcpServers[name] = {
                    command: server.command,
                    args: server.args,
                    description: server.description || ''
                };

                if (server.env && Object.keys(server.env).length > 0) {
                    config.mcpServers[name].env = server.env;
                }
            }
        }

        return JSON.stringify(config, null, 2);
    }

    // 从验证过的配置导入服务器
    importConfig(validatedConfig, mcpService) {
        try {
            const { config } = validatedConfig;
            const importedServers = [];

            // **FIX**: Clear all existing servers to ensure a clean import (replace instead of merge)
            mcpService.mcpServers.clear();
            console.log('[MCP-DEBUG] Cleared all existing servers before import.');

            // 导入新配置
            for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
                const server = {
                    name: serverName,
                    description: serverConfig.description || `${serverName} MCP服务器`,
                    status: 'disconnected',
                    imported: true // Mark as imported
                };

                if (serverConfig.type === 'streamable-http') {
                    server.type = 'streamable-http';
                    server.url = serverConfig.url;
                    server.headers = serverConfig.headers || {};
                } else if (serverConfig.type === 'sse') {
                    server.type = 'sse';
                    server.url = serverConfig.url;
                    server.headers = serverConfig.headers || {};
                    server.reconnectInterval = serverConfig.reconnectInterval || 5000;
                } else {
                    server.command = serverConfig.command;
                    server.args = serverConfig.args || [];
                    server.env = serverConfig.env || {};
                }

                mcpService.mcpServers.set(serverName, server);
                importedServers.push(serverName);
            }

            // 自动保存配置
            mcpService.saveMCPConfig();
            
            return {
                success: true,
                importedServers,
                message: `成功导入 ${importedServers.length} 个MCP服务器配置`
            };

        } catch (error) {
            return {
                success: false,
                error: `导入配置失败: ${error.message}`
            };
        }
    }

    // 从验证过的配置导入服务器（自动同步版本）
    importConfigAutoSync(validatedConfig, mcpService, uiController = null) {
        try {
            const { config } = validatedConfig;
            const importedServers = [];

            // 清除现有的导入服务器，避免重复
            const serversToDelete = [];
            for (const [name, server] of mcpService.mcpServers.entries()) {
                if (server.imported) {
                    serversToDelete.push(name);
                }
            }
            
            serversToDelete.forEach(name => {
                mcpService.mcpServers.delete(name);
            });

            // 导入新配置
            for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
                const server = {
                    name: serverName,
                    description: serverConfig.description || `${serverName} MCP服务器`,
                    status: 'disconnected',
                    imported: true // Mark as imported
                };

                if (serverConfig.type === 'streamable-http') {
                    server.type = 'streamable-http';
                    server.url = serverConfig.url;
                    server.headers = serverConfig.headers || {};
                } else if (serverConfig.type === 'sse') {
                    server.type = 'sse';
                    server.url = serverConfig.url;
                    server.headers = serverConfig.headers || {};
                    server.reconnectInterval = serverConfig.reconnectInterval || 5000;
                } else {
                    server.command = serverConfig.command;
                    server.args = serverConfig.args || [];
                    server.env = serverConfig.env || {};
                }

                mcpService.mcpServers.set(serverName, server);
                importedServers.push(serverName);
            }

            // 自动保存配置
            mcpService.saveMCPConfig();
            
            // 自动同步UI（如果提供了UI控制器）
            if (uiController) {
                setTimeout(() => {
                    uiController.renderMCPServers();
                    uiController.refreshMCPServiceList();
                }, 100);
            }
            
            return {
                success: true,
                importedServers,
                message: `成功导入 ${importedServers.length} 个MCP服务器配置`
            };

        } catch (error) {
            return {
                success: false,
                error: `导入配置失败: ${error.message}`
            };
        }
    }

    // 从文件导入配置
    async importConfigFromFile(file, mcpService, uiController = null) {
        try {
            const text = await file.text();
            const validationResult = this.validateConfig(text);
            
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: `配置验证失败: ${validationResult.errors.join(', ')}`
                };
            }
            
            return this.importConfigAutoSync(validationResult, mcpService, uiController);
            
        } catch (error) {
            return {
                success: false,
                error: `文件读取失败: ${error.message}`
            };
        }
    }

    // 生成配置模板HTML
    generateTemplateModal() {
        const examples = Object.entries(this.sampleConfigs).map(([name, config]) => {
            return `
                <div class="config-example">
                    <h4>${name}</h4>
                    <pre><code>${JSON.stringify(config, null, 2)}</code></pre>
                    <button class="help-btn" onclick="app.loadConfigExample('${name}')">使用此配置</button>
                </div>
            `;
        }).join('');

        return `
            <div class="config-template-modal" id="configTemplateModal">
                <div class="config-template-content">
                    <div class="config-template-header">
                        <h3>MCP服务器配置模板</h3>
                        <button class="template-close-btn" onclick="app.closeTemplateModal()">×</button>
                    </div>
                    <div class="config-template-body">
                        <h4>基本格式说明</h4>
                        <p>配置格式与Claude Desktop完全兼容，包含以下字段：</p>
                        <ul>
                            <li><strong>command</strong>: 启动命令（如 "npx", "python", "node"）</li>
                            <li><strong>args</strong>: 命令参数数组</li>
                            <li><strong>env</strong>: 环境变量对象（可选）</li>
                            <li><strong>description</strong>: 服务器描述（可选）</li>
                        </ul>

                        <h4>默认模板</h4>
                        <pre><code>${JSON.stringify(this.defaultTemplate, null, 2)}</code></pre>
                        <button class="help-btn" onclick="app.loadConfigTemplate()">使用默认模板</button>

                        <h4>配置示例</h4>
                        ${examples}
                    </div>
                </div>
            </div>
        `;
    }

    // 格式化验证结果
    formatValidationResult(result) {
        if (result.valid) {
            let message = '✅ 配置验证通过！';
            if (result.warnings.length > 0) {
                message += '\n\n⚠️ 警告信息：\n' + result.warnings.map(w => `• ${w}`).join('\n');
            }
            return { type: 'success', message };
        } else {
            let message = '❌ 配置验证失败：\n' + result.errors.map(e => `• ${e}`).join('\n');
            if (result.warnings.length > 0) {
                message += '\n\n⚠️ 警告信息：\n' + result.warnings.map(w => `• ${w}`).join('\n');
            }
            return { type: 'error', message };
        }
    }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MCPConfigManager;
}