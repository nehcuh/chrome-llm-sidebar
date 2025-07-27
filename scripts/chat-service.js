class ChatService {
    constructor(mcpService) {
        this.messages = [];
        this.config = {}; // This will be initialized by the main app
        this.searchService = new SearchService();
        this.mcpService = mcpService; // Use the provided instance
    }

    async init(config) {
        this.config = config;
        await this.loadHistory();
    }

    async loadHistory() {
        try {
            const result = await chrome.storage.local.get(['chatHistory']);
            if (result.chatHistory) {
                this.messages = result.chatHistory;
            }
        } catch (error) {
            console.error('Failed to load chat history:', error);
        }
    }

    async saveHistory() {
        try {
            const historyToSave = this.messages.filter(m => m.role === 'user' || m.role === 'assistant');
            await chrome.storage.local.set({ chatHistory: historyToSave });
        } catch (error) {
            console.error('Failed to save chat history:', error);
        }
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

    async sendMessage(messageText, webSearchEnabled, mcpToolsEnabled, getSelectedMCPServices) {
        const userMessage = this.addMessage('user', messageText);
        
        // Immediately render user message
        window.uiController.renderMessage(userMessage);

        const loadingMessage = this.addMessage('loading', '正在思考...');
        window.uiController.renderMessage(loadingMessage);

        try {
            let finalMessage = messageText;
            let toolsUsed = [];

            if (webSearchEnabled) {
                finalMessage = await this.enhanceMessageWithWebSearch(messageText);
            }

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

            const messageForLLM = this.formatMessageForLLM(messageText, toolsUsed);
            const response = await this.callOpenAIAPI(messageForLLM);
            
            this.removeMessage(loadingMessage.id);
            window.uiController.removeMessage(loadingMessage.id);

            const assistantMessage = this.addMessage('assistant', response);
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

    async callOpenAIAPI(message) {
        const response = await fetch(`${this.config.apiUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [
                    ...this.messages.filter(m => m.role !== 'loading').map(m => ({
                        role: m.role === 'user' ? 'user' : 'assistant',
                        content: m.content
                    })),
                    { role: 'user', content: message }
                ],
                temperature: parseFloat(this.config.temperature),
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData?.error?.message || `API request failed with status ${response.status}`;
            throw new Error(errorMessage);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }
    
    async enhanceMessageWithWebSearch(message) {
        if (this.searchService.shouldPerformSearch(message)) {
            const searchQuery = this.searchService.extractSearchQuery(message);
            const searchResults = await this.searchService.search(searchQuery);
            return `${message}\n\n以下是相关的搜索信息：\n${searchResults}\n\n请基于上述信息回答我的问题。`;
        }
        return message;
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
}