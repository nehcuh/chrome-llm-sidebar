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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.llmFindElementRequest) {
        askLLMToFindElement(message.llmFindElementRequest)
            .then(sendResponse)
            .catch(error => {
                console.error('[AGENT-MODE-LLM] Error:', error);
                sendResponse({ error: error.message });
            });
        return true; // Async response
    }

    if (message.action === 'mcpBridgeRequest') {
        handleMCPBridgeRequest(message.url, message.options).then(sendResponse);
        return true; // Indicates that the response is sent asynchronously
    }

    if (message.agenticAction) {
        handleAgenticAction(message.agenticAction, sender.tab)
            .then(sendResponse)
            .catch(error => {
                console.error('[AGENT-MODE] Error handling action:', error);
                sendResponse({ status: `Error: ${error.message}` });
            });
        return true; // Indicates that the response is sent asynchronously
    }
});

async function askLLMToFindElement({ dom, target, actionType }) {
    const { apiKey, apiUrl, model } = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
    if (!apiKey || !apiUrl || !model) {
        console.warn('[AGENT-MODE-LLM] API credentials not configured, using fallback matching');
        // Fallback: simple keyword matching
        const targetLower = target.toLowerCase();
        const matchingElements = dom.filter(el => 
            (el.text && el.text.toLowerCase().includes(targetLower)) ||
            (el.ariaLabel && el.ariaLabel.toLowerCase().includes(targetLower)) ||
            (el.placeholder && el.placeholder.toLowerCase().includes(targetLower)) ||
            (el.name && el.name.toLowerCase().includes(targetLower)) ||
            (el.id && el.id.toLowerCase().includes(targetLower))
        );
        
        if (matchingElements.length > 0) {
            // Return the first match
            return { agentId: matchingElements[0].agentId };
        }
        return { agentId: null };
    }

    const prompt = `
        You are an expert AI assistant helping a user interact with a webpage.
        The user wants to perform the action "${actionType}" on an element described as "${target}".
        
        Here is a simplified JSON representation of the interactive elements on the page. Pay close attention to attributes like 'ariaLabel', 'name', 'text', and 'value' to find the best match.
        ${JSON.stringify(dom, null, 2)}

        Based on the user's request, which element is the most likely target?
        You MUST respond with only the JSON object of the single best-matching element from the list above.
        If no element is a clear match, respond with an empty JSON object {}.
    `;

    const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            response_format: { type: "json_object" },
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `LLM API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    try {
        const resultJson = JSON.parse(content);
        console.log('[AGENT-MODE-LLM] Received from LLM:', resultJson);
        return resultJson; // Should contain agentId
    } catch (e) {
        console.error('[AGENT-MODE-LLM] Failed to parse LLM response:', content);
        throw new Error('LLM returned invalid JSON.');
    }
}

async function askLLMToSummarize(text) {
    const { apiKey, apiUrl, model } = await chrome.storage.local.get(['apiKey', 'apiUrl', 'model']);
    if (!apiKey || !apiUrl || !model) {
        throw new Error('API credentials are not configured in settings.');
    }

    const prompt = `Please provide a concise summary of the following text:\n\n---\n\n${text}`;

    const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `LLM API request failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
}


async function handleAgenticAction(action, senderTab) {
    console.log(`[AGENT-MODE] Executing action: ${action.type}`, action);
    
    // Validate action type
    if (!action || !action.type) {
        throw new Error('Invalid agentic action: missing type property');
    }
    
    let currentTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

    if (!currentTab && action.type !== 'CREATE_TAB') {
        throw new Error('No active tab found to perform the action.');
    }

    switch (action.type) {
        // Browser-level actions
        case 'RELOAD_TAB':
            await chrome.tabs.reload(currentTab.id);
            return { status: 'Tab reloaded' };
        case 'CREATE_TAB':
            const newTab = await chrome.tabs.create({ url: action.url || 'about:newtab' });
            currentTab = newTab;
            return { status: 'New tab created', tabId: newTab.id };
        case 'CLOSE_TAB':
            await chrome.tabs.remove(currentTab.id);
            return { status: 'Tab closed' };
        case 'NAVIGATE_TO_URL':
            await chrome.tabs.update(currentTab.id, { url: action.url });
            return { status: `Navigated to ${action.url}` };
        
        // Special action: Wait for navigation
        case 'WAIT_FOR_NAVIGATION':
            return new Promise((resolve) => {
                // Check if tab is already loaded
                chrome.tabs.get(currentTab.id, (tab) => {
                    if (tab.status === 'complete') {
                        resolve({ status: 'Navigation complete' });
                        return;
                    }
                    
                    // Wait for navigation to complete
                    const listener = (tabId, changeInfo, tab) => {
                        if (tabId === currentTab.id && changeInfo.status === 'complete') {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve({ status: 'Navigation complete' });
                        }
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                    
                    // Set a timeout in case navigation takes too long
                    setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve({ status: 'Navigation timeout' });
                    }, 10000);
                });
            });

        // Page-level actions (forwarded to content script)
        case 'CLICK_ELEMENT':
        case 'TYPE_IN_ELEMENT':
        case 'LIST_LINKS':
            console.log('[AGENT-MODE] Executing page-level action:', action.type, 'on tab:', currentTab.id);
            
            // Wait a bit more for the page to fully load after navigation
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                console.log('[AGENT-MODE] Sending message to content script...');
                const result = await chrome.tabs.sendMessage(currentTab.id, { agenticAction: action });
                console.log('[AGENT-MODE] Content script response:', result);
                return result;
            } catch (error) {
                console.error('[AGENT-MODE] Failed to send message to content script:', error);
                // Try to inject content script and retry
                try {
                    console.log('[AGENT-MODE] Injecting content script...');
                    await chrome.scripting.executeScript({
                        target: { tabId: currentTab.id },
                        files: ['content.js']
                    });
                    // Wait a moment for script to load
                    await new Promise(resolve => setTimeout(resolve, 500));
                    console.log('[AGENT-MODE] Retrying message to content script...');
                    const result = await chrome.tabs.sendMessage(currentTab.id, { agenticAction: action });
                    console.log('[AGENT-MODE] Content script response after injection:', result);
                    return result;
                } catch (injectError) {
                    throw new Error(`Failed to communicate with content script: ${error.message}. Injection also failed: ${injectError.message}`);
                }
            }
        
        case 'SUMMARIZE_PAGE':
            try {
                const contentResponse = await chrome.tabs.sendMessage(currentTab.id, { agenticAction: action });
                if (contentResponse && contentResponse.data) {
                    const summary = await askLLMToSummarize(contentResponse.data);
                    return { status: 'Page summarized', data: summary };
                }
                throw new Error('Failed to get page content for summarization.');
            } catch (error) {
                console.error('[AGENT-MODE] Failed to summarize page:', error);
                throw new Error(`Failed to summarize page: ${error.message}`);
            }

        // This action is handled by the chat service, should not reach here.
        case 'ANSWER_USER':
             return { status: 'Answered user directly.'};

        default:
            throw new Error(`Unknown agentic action type: ${action.type}`);
    }
}


// 仅保留与真实mcp-bridge通信所需的功能
async function handleMCPBridgeRequest(url, options = {}) {
    console.log(`[BACKGROUND] 代理请求: ${options.method || 'GET'} ${url}`);
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body || undefined
        });

        const contentType = response.headers.get("content-type");
        let data;
        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        } else {
            data = await response.text();
        }
        
        console.log(`[BACKGROUND] 桥接请求成功: Status ${response.status}`);

        return {
            success: true,
            data,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        };
    } catch (error) {
        console.error(`[BACKGROUND] 桥接请求失败 for ${url}:`, error);
        return {
            success: false,
            error: error.message,
            ok: false,
            status: 0
        };
    }
}