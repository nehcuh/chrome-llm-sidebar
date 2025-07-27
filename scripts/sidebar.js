// scripts/sidebar.js

class SidebarApp {
    constructor() {
        this.init();
    }

    async init() {
        // 1. Initialize shared services first
        const mcpService = new MCPService();
        const mcpConfigManager = new MCPConfigManager();

        // 2. Initialize components and inject dependencies
        const chatService = new ChatService(mcpService);
        const settingsManager = new SettingsManager(mcpService, mcpConfigManager);

        // 3. Make instances globally available for simplicity in this context
        //    (A more advanced setup might use a dependency injection container)
        window.chatService = chatService;
        window.settingsManager = settingsManager;

        // 4. Initialize core logic in the correct order
        await settingsManager.init();
        await chatService.init(settingsManager.config);

        // 5. Initialize the UI controller which depends on the services
        const uiController = new UIController(chatService, settingsManager);
        window.uiController = uiController;

        this.setupGlobalListeners();
        console.log("Simple AI Copilot initialized successfully.");
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
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new SidebarApp();
});
