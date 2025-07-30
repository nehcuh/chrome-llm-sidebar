class ChatService {
    constructor(mcpService, sessionManager = null) {
        this.messages = [];
        this.config = {}; // This will be initialized by the main app
        this.mcpService = mcpService; // Use the provided instance
        this.sessionManager = sessionManager; // Session manager instance
        this.currentSessionId = null;
    }

    async init(config) {
        this.config = config;
        await this.loadHistory();
    }

    async loadHistory() {
        try {
            if (this.sessionManager) {
                // 使用SessionManager加载当前会话的消息
                const currentSession = this.sessionManager.getCurrentSession();
                if (currentSession) {
                    this.messages = currentSession.messages || [];
                    this.currentSessionId = currentSession.id;
                }
            } else {
                // 向后兼容：从Chrome Storage加载
                const result = await chrome.storage.local.get(['chatHistory']);
                if (result.chatHistory) {
                    this.messages = result.chatHistory;
                }
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    async saveHistory() {
        try {
            if (this.sessionManager && this.currentSessionId) {
                // 使用SessionManager保存消息到当前会话
                const historyToSave = this.messages.filter(m => m.role === 'user' || m.role === 'assistant');
                
                // 清空当前会话的消息并重新添加
                await this.sessionManager.clearMessages(this.currentSessionId);
                for (const message of historyToSave) {
                    await this.sessionManager.addMessage(this.currentSessionId, message.role, message.content);
                }
            } else {
                // 向后兼容：保存到Chrome Storage
                const historyToSave = this.messages.filter(m => m.role === 'user' || m.role === 'assistant');
                await chrome.storage.local.set({ chatHistory: historyToSave });
            }
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
    }

    /**
     * 切换到指定会话
     */
    async switchToSession(sessionId) {
        try {
            if (!this.sessionManager) {
                throw new Error('SessionManager not available');
            }

            const session = this.sessionManager.getSession(sessionId);
            if (!session) {
                throw new Error(`Session not found: ${sessionId}`);
            }

            // 保存当前消息到原会话
            if (this.currentSessionId) {
                await this.saveHistory();
            }

            // 切换到新会话
            this.currentSessionId = sessionId;
            this.messages = session.messages || [];
            
            // 触发消息重新渲染
            if (window.uiController) {
                window.uiController.clearMessages();
                this.messages.forEach(message => {
                    window.uiController.renderMessage(message);
                });
            }

            console.log(`Switched to session: ${sessionId}`);
        } catch (error) {
            console.error('Failed to switch session:', error);
            throw error;
        }
    }

    /**
     * 获取当前会话ID
     */
    getCurrentSessionId() {
        return this.currentSessionId;
    }

    /**
     * 设置SessionManager
     */
    setSessionManager(sessionManager) {
        this.sessionManager = sessionManager;
    }

    addMessage(role, content) {
        const messageId = Date.now().toString() + Math.random(); // Add random number to avoid collision
        const message = { id: messageId, role, content, timestamp: new Date() };
        this.messages.push(message);
        this.saveHistory();
        return message;
    }

    removeMessage(messageId) {
        this.messages = this.messages.filter(m => m.id !== messageId);
        this.saveHistory();
    }

    async clearMessages() {
        this.messages = [];
        await this.saveHistory();
    }

    async sendMessage(messageText, mcpToolsEnabled, useFunctionCalling, getSelectedMCPServices) {
        const userMessage = this.addMessage('user', messageText);
        
        // Immediately render user message
        window.uiController.renderMessage(userMessage);

        const loadingMessage = this.addMessage('loading', '正在思考...');
        window.uiController.renderMessage(loadingMessage);

        try {
            let finalMessage = messageText;
            let toolsUsed = [];
            let responseText = '';

            // Determine if we should use Function Calling or the old MCP enhancement method
            const shouldUseFunctionCalling = mcpToolsEnabled && useFunctionCalling && this.mcpService.bridgeConnected;
            
            if (shouldUseFunctionCalling) {
                console.log('[CHAT-DEBUG] Using OpenAI Function Calling with MCP tools');
                const apiResponse = await this.callOpenAIAPI(finalMessage, true);
                responseText = await this.processOpenAIResponse(apiResponse, finalMessage);
            } else {
                // Fallback to the old method
                if (mcpToolsEnabled) {
                    const selectedServices = await getSelectedMCPServices();
                    if (selectedServices.length > 0) {
                        const { message: enhancedMessage, toolsUsed: mcpToolsUsed } = await this.mcpService.enhanceMessageWithTools(finalMessage);
                        if (mcpToolsUsed.length > 0) {
                            finalMessage = enhancedMessage;
                            toolsUsed = mcpToolsUsed;
                        }
                    }
                }
                
                const messageForLLM = this.formatMessageForLLM(finalMessage, toolsUsed);
                const apiResponse = await this.callOpenAIAPI(messageForLLM, false);
                responseText = apiResponse.choices[0].message.content;
            }
            
            this.removeMessage(loadingMessage.id);
            window.uiController.removeMessage(loadingMessage.id);

            const assistantMessage = this.addMessage('assistant', responseText);
            window.uiController.renderMessage(assistantMessage);

        } catch (error) {
            this.removeMessage(loadingMessage.id);
            window.uiController.removeMessage(loadingMessage.id);
            
            const errorMessageContent = `**请求出错**\n\n抱歉，在处理您的请求时遇到了问题。\n\n**错误详情:**\n${error.message}`;
            const errorMessage = this.addMessage('assistant', errorMessageContent);
            window.uiController.renderMessage(errorMessage);
            
            console.error('Error sending message:', error);
        }
    }

    async callOpenAIAPI(message, enableFunctionCalling = false) {
        const requestBody = {
            model: this.config.model,
            messages: [
                ...this.messages.filter(m => m.role !== 'loading').map(m => ({
                    role: m.role === 'user' ? 'user' : 'assistant',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                })),
                { role: 'user', content: typeof message === 'string' ? message : JSON.stringify(message) }
            ],
            temperature: parseFloat(this.config.temperature),
        };

        if (enableFunctionCalling && this.mcpService.bridgeConnected) {
            const availableTools = this.mcpService.getAvailableTools();
            if (availableTools.length > 0) {
                console.log('[CHAT-DEBUG] Adding function calling with tools:', availableTools.map(t => t.name));
                requestBody.tools = this.convertMCPToolsToOpenAIFormat(availableTools);
                requestBody.tool_choice = 'auto';
            }
        }

        const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData?.error?.message || `API request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data;
    }

    formatMessageForLLM(originalMessage, toolResults) {
        if (!toolResults || toolResults.length === 0) {
            return originalMessage;
        }
        let formattedMessage = `User query: "${originalMessage}"\n\n`;
        formattedMessage += 'Based on the results from the following tool calls, please answer the user query:\n';
        toolResults.forEach((tool, index) => {
            formattedMessage += `\nTool Call ${index + 1}: ${tool.name}\nResult: ${JSON.stringify(tool.result, null, 2)}\n`;
        });
        return formattedMessage;
    }

    // Convert MCP tools to OpenAI function format
    convertMCPToolsToOpenAIFormat(mcpTools) {
        return mcpTools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description || `MCP tool: ${tool.name}`,
                parameters: tool.inputSchema || {
                    type: 'object',
                    properties: {},
                    required: []
                }
            }
        }));
    }

    // Process OpenAI API response with possible function calls
    async processOpenAIResponse(data, originalMessage) {
        const message = data.choices[0].message;
        
        // If no tool calls, return the response directly
        if (!message.tool_calls || message.tool_calls.length === 0) {
            return message.content;
        }

        console.log('[CHAT-DEBUG] Processing tool calls:', message.tool_calls.map(tc => tc.function.name));
        
        // Execute all tool calls
        const toolResults = [];
        for (const toolCall of message.tool_calls) {
            try {
                const functionName = toolCall.function.name;
                const functionArgs = JSON.parse(toolCall.function.arguments);
                
                console.log(`[CHAT-DEBUG] Calling tool: ${functionName} with args:`, functionArgs);
                
                const result = await this.mcpService.callTool(functionName, functionArgs);
                
                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: 'tool',
                    name: functionName,
                    content: JSON.stringify(result)
                });
                
                console.log(`[CHAT-DEBUG] Tool ${functionName} result:`, result);
                
            } catch (error) {
                console.error(`[CHAT-ERROR] Tool call failed for ${toolCall.function.name}:`, error);
                toolResults.push({
                    tool_call_id: toolCall.id,
                    role: 'tool', 
                    name: toolCall.function.name,
                    content: JSON.stringify({ error: error.message })
                });
            }
        }
        
        // Make a second API call with the tool results
        const followUpMessages = [
            ...this.messages.filter(m => m.role !== 'loading').map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
            })),
            { role: 'user', content: typeof originalMessage === 'string' ? originalMessage : JSON.stringify(originalMessage) },
            message, // The assistant message with tool calls
            ...toolResults // The tool results
        ];
        
        console.log('[CHAT-DEBUG] Making follow-up API call with tool results');
        
        const followUpResponse = await fetch(`${this.config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: followUpMessages,
                temperature: parseFloat(this.config.temperature)
            })
        });
        
        if (!followUpResponse.ok) {
            const errorData = await followUpResponse.json().catch(() => ({}));
            throw new Error(errorData?.error?.message || `Follow-up API request failed with status ${followUpResponse.status}`);
        }
        
        const followUpData = await followUpResponse.json();
        return followUpData.choices[0].message.content;
    }
}
