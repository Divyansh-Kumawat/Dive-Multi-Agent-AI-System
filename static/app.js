document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const researchForm = document.getElementById("research-form");
    const topicInput = document.getElementById("topic-input");
    const submitBtn = document.getElementById("submit-btn");
    const historyList = document.getElementById("history-list");
    const clearHistoryBtn = document.getElementById("clear-history-btn");
    
    const currentTopicLabel = document.getElementById("current-topic-label");
    const statusBadge = document.getElementById("status-badge");
    const copyReportBtn = document.getElementById("copy-report-btn");
    const downloadReportBtn = document.getElementById("download-report-btn");
    
    const logBanner = document.getElementById("log-banner");
    const logText = document.getElementById("log-text");
    
    const welcomeState = document.getElementById("welcome-state");
    const resultsContent = document.getElementById("results-content");
    const reportOutput = document.getElementById("report-output");
    
    const scoreCircleProgress = document.getElementById("score-circle-progress");
    const scoreText = document.getElementById("score-text");
    const strengthsList = document.getElementById("strengths-list");
    const improvementsList = document.getElementById("improvements-list");
    const verdictText = document.getElementById("verdict-text");
    
    const themeToggleBtn = document.getElementById("theme-toggle-btn");

    // Pipeline Steps DOM Mapping
    const steps = {
        search: document.getElementById("step-search"),
        reader: document.getElementById("step-reader"),
        writer: document.getElementById("step-writer"),
        critic: document.getElementById("step-critic")
    };

    // State Variables
    let currentEventSource = null;
    let activeReportMarkdown = "";
    let activeCriticFeedback = "";
    let selectedHistoryTopic = null;

    // Initialize Page
    loadThemePreference();
    fetchHistory();

    // Event Listeners
    researchForm.addEventListener("submit", handleResearchSubmit);
    themeToggleBtn.addEventListener("click", toggleTheme);
    copyReportBtn.addEventListener("click", copyReportToClipboard);
    downloadReportBtn.addEventListener("click", downloadReportAsFile);
    clearHistoryBtn.addEventListener("click", clearHistory);

    // Theme Manager
    function toggleTheme() {
        const currentTheme = document.body.getAttribute("data-theme");
        const newTheme = currentTheme === "light" ? "dark" : "light";
        
        document.body.setAttribute("data-theme", newTheme);
        localStorage.setItem("theme", newTheme);
        updateThemeToggleBtnUI(newTheme);
    }

    function loadThemePreference() {
        const savedTheme = localStorage.getItem("theme") || "dark";
        document.body.setAttribute("data-theme", savedTheme);
        updateThemeToggleBtnUI(savedTheme);
    }

    function updateThemeToggleBtnUI(theme) {
        if (theme === "light") {
            themeToggleBtn.innerHTML = `<i class="fa-solid fa-sun"></i> <span>Light Mode</span>`;
        } else {
            themeToggleBtn.innerHTML = `<i class="fa-solid fa-moon"></i> <span>Dark Mode</span>`;
        }
    }

    // Fetch and Render History
    async function fetchHistory() {
        try {
            const resp = await fetch("/api/history");
            if (!resp.ok) throw new Error("Failed to fetch history");
            const history = await resp.json();
            renderHistoryList(history);
        } catch (err) {
            console.error("History fetch error:", err);
        }
    }

    function renderHistoryList(history) {
        historyList.innerHTML = "";
        
        if (!history || history.length === 0) {
            historyList.innerHTML = `<div class="history-empty">No previous research runs</div>`;
            return;
        }

        history.forEach(item => {
            const div = document.createElement("div");
            div.className = "history-item";
            if (selectedHistoryTopic === item.topic) {
                div.classList.add("active");
            }
            
            div.innerHTML = `
                <div class="history-topic" title="${escapeHtml(item.topic)}">${escapeHtml(item.topic)}</div>
                <div class="history-meta">
                    <span><i class="fa-solid fa-calendar-day"></i> ${item.timestamp}</span>
                </div>
            `;
            
            div.addEventListener("click", () => {
                // Highlight item
                document.querySelectorAll(".history-item").forEach(el => el.classList.remove("active"));
                div.classList.add("active");
                selectedHistoryTopic = item.topic;
                
                // Show historical report
                showReport(item.topic, item.report, item.feedback);
                resetPipelineUI();
                
                // Update header status
                currentTopicLabel.textContent = item.topic;
                statusBadge.textContent = "Saved";
                statusBadge.className = "badge badge-success";
                
                logBanner.className = "log-banner";
                logText.textContent = "Displaying cached research report from history.";
            });
            
            historyList.appendChild(div);
        });
    }

    async function clearHistory() {
        if (confirm("Are you sure you want to clear your local history files? This action cannot be undone.")) {
            try {
                // Write an empty array to research_history.json by clearing on client and sending it, or just write it.
                // We'll write a simple history clean route if we want to, but for now uvicorn writes history if we do an empty search or we can add a delete endpoint.
                // Let's create an endpoint in server.py or just mock it. Wait, the simplest way is to fetch an empty payload or implement a DELETE route.
                // Let's implement a DELETE endpoint or just clear it in memory.
                const resp = await fetch("/api/history", { method: "POST", headers: { "Content-Type": "application/json" }, body: "[]" });
                // Let's check server.py: it supports uvicorn history get. Let's make sure we add a POST handler or endpoint in server.py to clear history if they ask.
                // To keep it simple, we can just call DELETE or post empty list.
                // Let's make sure our server.py has an endpoint or we can add it later. For now let's just make a POST to /api/history. We'll add it to server.py as well.
                const response = await fetch("/api/history/clear", { method: "POST" });
                if (response.ok) {
                    fetchHistory();
                }
            } catch (err) {
                console.error("Clear history error:", err);
            }
        }
    }

    // Submit Research
    function handleResearchSubmit(e) {
        e.preventDefault();
        const topic = topicInput.value.trim();
        if (!topic) return;

        // Cancel previous EventSource if running
        if (currentEventSource) {
            currentEventSource.close();
        }

        // UI Reset for a new run
        activeReportMarkdown = "";
        activeCriticFeedback = "";
        selectedHistoryTopic = null;
        currentTopicLabel.textContent = topic;
        
        // Show running badge
        statusBadge.textContent = "Researching";
        statusBadge.className = "badge badge-running";
        
        // Disable search controls
        topicInput.disabled = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running...`;

        // Reset reports view
        welcomeState.classList.add("hidden");
        resultsContent.classList.add("hidden");
        reportOutput.innerHTML = "";
        
        // Reset action buttons
        copyReportBtn.disabled = true;
        downloadReportBtn.disabled = true;

        // Reset Pipeline Cards UI
        resetPipelineUI();

        // Connect Server-Sent Events
        const url = `/api/research?topic=${encodeURIComponent(topic)}`;
        currentEventSource = new EventSource(url);

        currentEventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handlePipelineEvent(data);
            } catch (err) {
                console.error("Error parsing event data:", err);
            }
        };

        currentEventSource.onerror = (err) => {
            console.error("EventSource connection error:", err);
            currentEventSource.close();
            
            // UI Error state
            statusBadge.textContent = "Failed";
            statusBadge.className = "badge badge-error";
            logBanner.style.color = "var(--color-error)";
            logText.textContent = "Connection to research agent pipeline lost. Please try again.";
            
            // Re-enable controls
            topicInput.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <span>Start Deep Research</span>`;
        };
    }

    // Handle SSE Pipeline Events
    function handlePipelineEvent(eventData) {
        const step = eventData.step;
        const msg = eventData.message;
        const payload = eventData.data;

        if (step === "search_start") {
            setStepState("search", "active");
            updateLogBanner(msg, "var(--color-secondary)");
        } else if (step === "search_results") {
            setStepState("search", "completed");
            updateLogBanner("Search completed. Found resources.", "var(--color-success)");
        } else if (step === "reader_start") {
            setStepState("reader", "active");
            updateLogBanner(msg, "var(--color-primary)");
        } else if (step === "reader_results") {
            setStepState("reader", "completed");
            updateLogBanner("Scraped top relevant page successfully.", "var(--color-success)");
        } else if (step === "writer_start") {
            setStepState("writer", "active");
            updateLogBanner(msg, "var(--color-primary)");
        } else if (step === "writer_results") {
            setStepState("writer", "completed");
            activeReportMarkdown = payload;
            
            // Render Report Draft immediately
            resultsContent.classList.remove("hidden");
            welcomeState.classList.add("hidden");
            reportOutput.innerHTML = marked.parse(payload);
            
            // Enable Actions
            copyReportBtn.disabled = false;
            downloadReportBtn.disabled = false;
            
            updateLogBanner("Report drafted successfully.", "var(--color-success)");
        } else if (step === "critic_start") {
            setStepState("critic", "active");
            updateLogBanner(msg, "var(--color-warning)");
        } else if (step === "critic_results") {
            setStepState("critic", "completed");
            activeCriticFeedback = payload;
            
            // Display Evaluated Critic Panel
            renderCriticFeedback(payload);
            
            updateLogBanner("Critic evaluation completed.", "var(--color-success)");
        } else if (step === "done") {
            currentEventSource.close();
            currentEventSource = null;
            
            // Success status UI
            statusBadge.textContent = "Done";
            statusBadge.className = "badge badge-success";
            updateLogBanner(msg, "var(--color-success)");
            
            // Re-enable input controls
            topicInput.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <span>Start Deep Research</span>`;
            topicInput.value = "";
            
            // Refresh history
            fetchHistory();
        } else if (step === "error") {
            currentEventSource.close();
            currentEventSource = null;
            
            statusBadge.textContent = "Error";
            statusBadge.className = "badge badge-error";
            updateLogBanner(msg, "var(--color-error)");
            
            topicInput.disabled = false;
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fa-solid fa-magnifying-glass"></i> <span>Start Deep Research</span>`;
        }
    }

    // Step Class Mutator
    function setStepState(stepKey, stateClass) {
        const card = steps[stepKey];
        if (!card) return;
        
        card.classList.remove("active", "completed");
        if (stateClass) {
            card.classList.add(stateClass);
        }
    }

    function resetPipelineUI() {
        Object.keys(steps).forEach(key => {
            setStepState(key, null);
        });
    }

    function updateLogBanner(text, color) {
        logText.textContent = text;
        logBanner.style.color = color || "var(--text-primary)";
    }

    // Render a completed historical/fresh report in the main panel
    function showReport(topic, reportMd, feedbackTxt) {
        activeReportMarkdown = reportMd;
        activeCriticFeedback = feedbackTxt;
        
        welcomeState.classList.add("hidden");
        resultsContent.classList.remove("hidden");
        
        reportOutput.innerHTML = marked.parse(reportMd);
        renderCriticFeedback(feedbackTxt);
        
        copyReportBtn.disabled = false;
        downloadReportBtn.disabled = false;
    }

    // Critic Feedback Parser & UI Renderer
    function renderCriticFeedback(feedbackRaw) {
        const parsed = parseCriticFeedback(feedbackRaw);
        
        // Render Score Wheel
        const dashValue = (parsed.score / 10) * 100;
        scoreCircleProgress.setAttribute("stroke-dasharray", `${dashValue}, 100`);
        scoreText.textContent = `${parsed.score}/10`;
        
        // Color scale the circle based on score
        if (parsed.score >= 8) {
            scoreCircleProgress.style.stroke = "var(--color-success)";
        } else if (parsed.score >= 5) {
            scoreCircleProgress.style.stroke = "var(--color-warning)";
        } else {
            scoreCircleProgress.style.stroke = "var(--color-error)";
        }

        // Render Strengths
        strengthsList.innerHTML = "";
        if (parsed.strengths.length > 0) {
            parsed.strengths.forEach(s => {
                const li = document.createElement("li");
                li.textContent = s;
                strengthsList.appendChild(li);
            });
        } else {
            strengthsList.innerHTML = `<li>No strengths explicitly listed.</li>`;
        }

        // Render Areas to Improve
        improvementsList.innerHTML = "";
        if (parsed.improvements.length > 0) {
            parsed.improvements.forEach(imp => {
                const li = document.createElement("li");
                li.textContent = imp;
                improvementsList.appendChild(li);
            });
        } else {
            improvementsList.innerHTML = `<li>No improvements explicitly listed.</li>`;
        }

        // Render Verdict
        verdictText.textContent = parsed.verdict || "No verdict output available.";
    }

    // Critic parser utility
    function parseCriticFeedback(text) {
        let score = 0;
        let strengths = [];
        let improvements = [];
        let verdict = "";

        if (!text) {
            return { score, strengths, improvements, verdict };
        }

        // Parse score
        const scoreMatch = text.match(/Score:\s*(\d+(\.\d+)?)\s*\/\s*10/i) || text.match(/(\d+(\.\d+)?)\s*\/\s*10/);
        if (scoreMatch) {
            score = parseFloat(scoreMatch[1]);
        }

        // Parse segments
        const sections = text.split(/(Strengths:|Areas\s+to\s+Improve:|One\s+line\s+verdict:)/i);
        
        for (let i = 0; i < sections.length; i++) {
            const sect = sections[i].toLowerCase();
            if (sect.includes("strengths:") && i + 1 < sections.length) {
                strengths = parseList(sections[i + 1]);
            } else if (sect.includes("improve:") && i + 1 < sections.length) {
                improvements = parseList(sections[i + 1]);
            } else if (sect.includes("verdict:") && i + 1 < sections.length) {
                verdict = sections[i + 1].trim();
            }
        }

        // Bullet point fallbacks if split failed
        if (strengths.length === 0 && improvements.length === 0) {
            const bullets = text.match(/^\s*-\s*.+$/gm) || [];
            bullets.forEach(b => {
                const clean = b.replace(/^\s*-\s*/, "").trim();
                if (clean) strengths.push(clean);
            });
        }

        if (!verdict) {
            const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
            verdict = lines[lines.length - 1] || "Feedback compiled.";
        }

        return { score, strengths, improvements, verdict };
    }

    function parseList(sectionText) {
        return sectionText
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.startsWith("-") || line.startsWith("*"))
            .map(line => line.replace(/^[-*]\s*/, "").trim())
            .filter(Boolean);
    }

    // Actions implementation
    function copyReportToClipboard() {
        if (!activeReportMarkdown) return;
        
        navigator.clipboard.writeText(activeReportMarkdown).then(() => {
            const prevText = copyReportBtn.innerHTML;
            copyReportBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
            setTimeout(() => {
                copyReportBtn.innerHTML = prevText;
            }, 2000);
        }).catch(err => {
            console.error("Clipboard copy error:", err);
        });
    }

    function downloadReportAsFile() {
        if (!activeReportMarkdown) return;
        
        const topic = currentTopicLabel.textContent || "research-report";
        const filename = `${topic.toLowerCase().replace(/[^a-z0-9]/g, "-")}-report.md`;
        
        const blob = new Blob([activeReportMarkdown], { type: "text/markdown;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // HTML Escaping Utility
    function escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
