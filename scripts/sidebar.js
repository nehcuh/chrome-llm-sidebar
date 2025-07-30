// scripts/sidebar.js

class SidebarApp {
    constructor() {
        this.init();
    }

    async init() {
        try {
            // 1. Initialize data migration first
            const migrationManager = new DataMigrationManager();
            await migrationManager.migrate();
            
            // 2. Initialize database and managers
            const dbManager = new DatabaseManager();
            const sessionManager = new SessionManager(dbManager);
            const promptManager = new PromptManager(dbManager);
            
            // 3. Initialize shared services
            const mcpService = new MCPService();
            const mcpConfigManager = new MCPConfigManager();

            // 4. Initialize components and inject dependencies
            const chatService = new ChatService(mcpService, sessionManager);
            const settingsManager = new SettingsManager(mcpService, mcpConfigManager);

            // 5. Make instances globally available for simplicity in this context
            window.dbManager = dbManager;
            window.sessionManager = sessionManager;
            window.promptManager = promptManager;
            window.chatService = chatService;
            window.settingsManager = settingsManager;
            window.migrationManager = migrationManager;

            // 6. Initialize core logic in the correct order
            await dbManager.init();
            await sessionManager.init();
            await promptManager.init();
            await settingsManager.init();
            await chatService.init(settingsManager.config);

            // 7. Initialize the UI controller which depends on the services
            const uiController = new UIController(chatService, settingsManager, sessionManager, promptManager);
            window.uiController = uiController;

            // 8. Initialize the UI component manager
            const uiComponentManager = new UIComponentManager(sessionManager, promptManager, chatService);
            window.uiComponentManager = uiComponentManager;

            this.setupGlobalListeners();
            console.log("Simple AI Copilot initialized successfully.");
            
        } catch (error) {
            console.error('Failed to initialize application:', error);
            // 显示错误信息给用户
            this.showErrorToUser('应用初始化失败', error.message);
        }
    }

    setupGlobalListeners() {
        // Listen for messages from other parts of the extension (e.g., popup)
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'openSettings') {
                if (window.uiController) {
                    window.uiController.showSettings();
                }
                sendResponse({ success: true });
            }
            return true; // Keep the message channel open for async responses
        });
    }

    showErrorToUser(title, message) {
        // 创建错误提示元素
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 300px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;
        
        errorDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">${title}</div>
            <div style="font-size: 14px; opacity: 0.9;">${message}</div>
        `;
        
        document.body.appendChild(errorDiv);
        
        // 5秒后自动移除
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new SidebarApp();
});
