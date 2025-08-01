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
        window.uiController.renderMessage(userMessage);

        const loadingMessage = this.addMessage('loading', '正在为您规划任务...');
        window.uiController.renderMessage(loadingMessage);

        try {
            // Check if MCP is enabled in settings
            const settings = await chrome.storage.sync.get(['mcpEnabled']);
            const mcpEnabled = settings.mcpEnabled || false;
            
            // Only enable MCP tools if both globally enabled and user requested
            const actualMcpToolsEnabled = mcpEnabled && mcpToolsEnabled;
            
            // Gather context for the planner
            const conversationHistory = this.messages.slice(-10); // Get last 10 messages
            const lastActionPlan = window.taskExecutor.lastSuccessfulPlan;

            const plan = await this.getPlanFromLLM(messageText, conversationHistory, lastActionPlan);
            
            this.removeMessage(loadingMessage.id);
            window.uiController.removeMessage(loadingMessage.id);

            // If the plan is just a simple answer, render it and stop.
            if (plan.length === 1 && plan[0].type === 'ANSWER_USER') {
                const assistantMessage = this.addMessage('assistant', plan[0].text);
                window.uiController.renderMessage(assistantMessage);
                return;
            }

            // Add the plan to the chat for transparency
            const planMessage = this.addMessage('assistant', `好的，这是我的计划：\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\``);
            window.uiController.renderMessage(planMessage);

            // If it's a sequence of actions, start the executor
            window.taskExecutor.start(plan);

        } catch (error) {
            this.removeMessage(loadingMessage.id);
            window.uiController.removeMessage(loadingMessage.id);
            
            const errorMessageContent = `**任务规划失败**\n\n抱歉，在理解您的指令时遇到了问题。\n\n**错误详情:**\n${error.message}`;
            const errorMessage = this.addMessage('assistant', errorMessageContent);
            window.uiController.renderMessage(errorMessage);
            
            console.error('Error getting plan from LLM:', error);
        }
    }

    async getPlanFromLLM(messageText, conversationHistory, lastActionPlan) {
        const historyString = conversationHistory
            .map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content.substring(0, 200) : 'Complex Object'}`)
            .join('\n');

        const plannerPrompt = `
            You are a stateful browser control assistant with memory and adaptive strategies.
            Your task is to understand the user's latest instruction based on the provided context (conversation history and last executed action plan) and then create a new action plan as a JSON array.

            Available atomic actions:
            - CLICK_ELEMENT(target: string)
            - TYPE_IN_ELEMENT(target: string, value: string)
            - NAVIGATE_TO_URL(url: string)
            - SUMMARIZE_PAGE()
            - LIST_LINKS()
            - WAIT_FOR_NAVIGATION()
            - ANSWER_USER(text: string)
            - RELOAD_TAB()
            - CREATE_TAB()
            - CLOSE_TAB()

            IMPORTANT: For search tasks, always include WAIT_FOR_NAVIGATION() after NAVIGATE_TO_URL and before typing/searching.

            Your response must be a JSON array with objects that have a "type" field and corresponding parameters:
            [
              {
                "type": "NAVIGATE_TO_URL",
                "url": "https://example.com"
              },
              {
                "type": "WAIT_FOR_NAVIGATION"
              },
              {
                "type": "TYPE_IN_ELEMENT",
                "target": "search input",
                "value": "search query"
              },
              {
                "type": "CLICK_ELEMENT", 
                "target": "search button"
              }
            ]

            Examples:
            User: "打开 google, 帮我搜索今日新闻"
            Plan: [
              {"type": "NAVIGATE_TO_URL", "url": "https://www.google.com"},
              {"type": "WAIT_FOR_NAVIGATION"},
              {"type": "TYPE_IN_ELEMENT", "target": "Google search input", "value": "今日新闻"},
              {"type": "CLICK_ELEMENT", "target": "Google search button"}
            ]

            User: "帮我在新标签页打开Google，并搜索今日新闻"
            Plan: [
              {"type": "CREATE_TAB"},
              {"type": "NAVIGATE_TO_URL", "url": "https://www.google.com"},
              {"type": "WAIT_FOR_NAVIGATION"},
              {"type": "TYPE_IN_ELEMENT", "target": "Google search input", "value": "今日新闻"},
              {"type": "CLICK_ELEMENT", "target": "Google search button"}
            ]

            User: "Search for Chrome extensions on Baidu"
            Plan: [
              {"type": "NAVIGATE_TO_URL", "url": "https://www.baidu.com"},
              {"type": "WAIT_FOR_NAVIGATION"},
              {"type": "TYPE_IN_ELEMENT", "target": "Baidu search input", "value": "Chrome extensions"},
              {"type": "CLICK_ELEMENT", "target": "Baidu search button"}
            ]

            User: "帮我打开邮箱，将其中的预警信息都删除"
            Plan: [
              {"type": "CLICK_ELEMENT", "target": "邮箱"},
              {"type": "WAIT_FOR_NAVIGATION"},
              {"type": "ANSWER_USER", "text": "我已经进入了邮箱页面。现在我会查找带有'预警'字样的邮件，然后进行批量删除操作。"},
              {"type": "CLICK_ELEMENT", "target": "预警邮件"},
              {"type": "CLICK_ELEMENT", "target": "预警邮件"},
              {"type": "CLICK_ELEMENT", "target": "预警邮件"},
              {"type": "CLICK_ELEMENT", "target": "删除按钮"},
              {"type": "ANSWER_USER", "text": "我已经选中了所有预警邮件并执行了删除操作。"}
            ]

            User: "删除所有带有'预警'字样的邮件"
            Plan: [
              {"type": "ANSWER_USER", "text": "我将在当前邮件列表中查找所有带有'预警'字样的邮件，然后进行批量删除。"},
              {"type": "CLICK_ELEMENT", "target": "带有预警字样的邮件"},
              {"type": "CLICK_ELEMENT", "target": "带有预警字样的邮件"},
              {"type": "CLICK_ELEMENT", "target": "带有预警字样的邮件"},
              {"type": "CLICK_ELEMENT", "target": "管理按钮"},
              {"type": "CLICK_ELEMENT", "target": "删除按钮"},
              {"type": "ANSWER_USER", "text": "我已经完成了批量删除预警邮件的操作。"}
            ]

            ---
            [CONTEXT]

            [Recent Conversation History]
            ${historyString}

            [Last Executed Action Plan]
            ${lastActionPlan ? JSON.stringify(lastActionPlan, null, 2) : 'None'}

            ---
            [LATEST USER INSTRUCTION]
            "${messageText}"

            ---
            [YOUR NEW ACTION PLAN]
            Based on all the context above, what is the next action plan?
            Your output must be a single JSON array following the format shown above.
            
            IMPORTANT: If the user request involves batch operations (like deleting multiple items), include ANSWER_USER actions to explain the process and provide feedback.
        `;

        const requestBody = {
            model: this.config.model,
            messages: [{ role: 'user', content: plannerPrompt }],
            temperature: 0,
        };
        
        if (this.config.model.includes('gpt-4-1106-preview') || this.config.model.includes('gpt-4-turbo')) {
            requestBody.response_format = { type: "json_object" };
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
            throw new Error(errorData?.error?.message || `Planner API request failed with status ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0].message.content;

        try {
            // Extract JSON from the response, which might be wrapped in markdown
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
            const jsonString = jsonMatch ? jsonMatch[1] : content;
            
            const result = JSON.parse(jsonString);
            const plan = Array.isArray(result) ? result : result.plan;

            if (!plan) {
                throw new Error("The AI planner returned an object without a 'plan' key or a valid array.");
            }
            
            // Validate all tasks have valid types
            const validTypes = ['CLICK_ELEMENT', 'TYPE_IN_ELEMENT', 'NAVIGATE_TO_URL', 'SUMMARIZE_PAGE', 'LIST_LINKS', 'WAIT_FOR_NAVIGATION', 'ANSWER_USER', 'RELOAD_TAB', 'CREATE_TAB', 'CLOSE_TAB'];
            
            if (!Array.isArray(plan)) {
                throw new Error("Plan must be an array of tasks.");
            }
            
            for (let i = 0; i < plan.length; i++) {
                const task = plan[i];
                if (!task || typeof task !== 'object') {
                    throw new Error(`Task at index ${i} is not a valid object.`);
                }
                if (!task.type || !validTypes.includes(task.type)) {
                    throw new Error(`Task at index ${i} has invalid or missing type: ${task.type}. Valid types are: ${validTypes.join(', ')}`);
                }
            }
            
            return plan;
        } catch (e) {
            console.error("Failed to parse plan from LLM:", content, e);
            throw new Error("The AI planner returned an invalid plan format.");
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
            // Check if MCP is enabled in settings
            const settings = await chrome.storage.sync.get(['mcpEnabled']);
            const mcpEnabled = settings.mcpEnabled || false;
            
            if (mcpEnabled) {
                const availableTools = this.mcpService.getAvailableTools();
                if (availableTools.length > 0) {
                    console.log('[CHAT-DEBUG] Adding function calling with tools:', availableTools.map(t => t.name));
                    requestBody.tools = this.convertMCPToolsToOpenAIFormat(availableTools);
                    requestBody.tool_choice = 'auto';
                }
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
