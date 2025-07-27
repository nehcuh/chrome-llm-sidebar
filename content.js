// Content script for Simple AI Copilot
// This script runs on web pages and can interact with the page content

class ContentScript {
    constructor() {
        this.init();
    }

    init() {
        this.injectPageStyles();
        this.setupMessageListener();
    }

    injectPageStyles() {
        // Add subtle indication that the copilot is active
        const style = document.createElement('style');
        style.textContent = `
            .ai-copilot-highlight {
                outline: 2px solid #007bff !important;
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case 'getPageContent':
                    sendResponse({ content: this.getPageContent() });
                    break;
                case 'highlightElement':
                    this.highlightElement(message.selector);
                    break;
                default:
                    break;
            }
            return true;
        });
    }

    getPageContent() {
        // Extract useful page content for AI context
        return {
            title: document.title,
            url: window.location.href,
            selectedText: window.getSelection().toString(),
            headings: Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.textContent),
            description: document.querySelector('meta[name="description"]')?.content || ''
        };
    }

    highlightElement(selector) {
        // Remove previous highlights
        document.querySelectorAll('.ai-copilot-highlight').forEach(el => {
            el.classList.remove('ai-copilot-highlight');
        });

        // Add new highlight
        if (selector) {
            const element = document.querySelector(selector);
            if (element) {
                element.classList.add('ai-copilot-highlight');
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }
}

new ContentScript();