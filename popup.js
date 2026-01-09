// API base URL
const API_BASE_URL = 'https://fluf.io';

// Store state
let currentUserId = null;
let processingItemVid = null;
let selectedVids = new Set();
let currentQueue = [];
let pendingDeleteVids = [];

// Function to display status in the popup
function displayStatus(statusData) {
    const statusElement = document.getElementById("status");
    statusElement.classList.remove("success", "error", "neutral");

    if (!statusData) {
        statusElement.innerText = "No status available";
        statusElement.classList.add("neutral");
        return;
    }

    let formattedTime = "";
    if (statusData.timestamp) {
        const date = new Date(statusData.timestamp);
        formattedTime = ` (${date.toLocaleString()})`;
    }

    statusElement.innerText = statusData.message + formattedTime;

    if (statusData.success === true) {
        statusElement.classList.add("success");
    } else if (statusData.success === false) {
        statusElement.classList.add("error");
    } else {
        statusElement.classList.add("neutral");
    }
}

// Function to get current status
function getStatus() {
    chrome.runtime.sendMessage({ action: "FCU_getStatus" }, (response) => {
        displayStatus(response);
    });
}

// Function to load version number from manifest
function loadVersionNumber() {
    const manifest = chrome.runtime.getManifest();
    const versionElement = document.getElementById("version-number");
    if (versionElement && manifest.version) {
        versionElement.textContent = `v${manifest.version}`;
    }
}

// Function to get user ID from background script
async function getUserId() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "FCU_getUserId" }, (response) => {
            resolve(response?.userId || null);
        });
    });
}

// Function to send telemetry
function sendTelemetry(eventType, data) {
    try {
        chrome.runtime.sendMessage({
            action: "FCU_sendTelemetry",
            eventType: eventType,
            data: data
        });
    } catch (error) {
        console.error('Telemetry error:', error);
    }
}

// Function to fetch popup data from API
async function fetchPopupData(userId) {
    try {
        const response = await fetch(`${API_BASE_URL}/wp-json/fc/v1/extension-popup-data?uid=${userId}`);
        if (!response.ok) throw new Error('Failed to fetch');
        return await response.json();
    } catch (error) {
        console.error('Error fetching popup data:', error);
        return null;
    }
}

// Trash icon SVG
const trashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

// Function to render queue items
function renderQueueList(queue) {
    const queueListElement = document.getElementById('queueList');
    const queueCountElement = document.getElementById('queueCount');
    const queueActionsElement = document.getElementById('queueActions');

    if (!queueListElement) return;

    // Store current queue for selection management
    currentQueue = queue;

    if (queueCountElement) {
        queueCountElement.textContent = queue.length;
    }

    // Show/hide queue actions
    if (queueActionsElement) {
        queueActionsElement.style.display = queue.length > 0 ? 'flex' : 'none';
    }

    if (!queue || queue.length === 0) {
        queueListElement.innerHTML = '<div class="queue-empty">No items in queue</div>';
        selectedVids.clear();
        updateDeleteSelectedButton();
        return;
    }

    // Remove any selected vids that are no longer in the queue
    const currentVids = new Set(queue.map(item => item.vid));
    selectedVids.forEach(vid => {
        if (!currentVids.has(vid)) {
            selectedVids.delete(vid);
        }
    });
    updateDeleteSelectedButton();
    updateSelectAllCheckbox();

    queueListElement.innerHTML = queue.map((item) => {
        const isProcessing = processingItemVid && item.vid === processingItemVid;
        const hasError = item.error_message && item.status !== 'pending';
        const itemClass = isProcessing ? 'processing' : (hasError ? 'has-error' : '');
        const isSelected = selectedVids.has(item.vid);

        let statusLabel = 'Queued';
        let statusClass = 'pending';
        if (isProcessing) {
            statusLabel = 'Processing';
            statusClass = 'processing';
        } else if (hasError) {
            statusLabel = 'Error';
            statusClass = 'error';
        }

        let queuedTime = '';
        if (item.queued_at) {
            const diffMs = Date.now() - (item.queued_at * 1000);
            const diffMins = Math.floor(diffMs / 60000);
            queuedTime = diffMins < 60 ? `${diffMins}m ago` : `${Math.floor(diffMins / 60)}h ago`;
        }

        return `
            <div class="queue-item ${itemClass}">
                <input type="checkbox" class="queue-item-checkbox" data-vid="${item.vid}" ${isSelected ? 'checked' : ''}>
                ${item.thumbnail
                    ? `<img class="queue-item-thumbnail" src="${item.thumbnail}" alt="" onerror="this.outerHTML='<div class=\\'queue-item-thumbnail placeholder\\'>No img</div>'">`
                    : `<div class="queue-item-thumbnail placeholder">No img</div>`
                }
                <div class="queue-item-info">
                    <div class="queue-item-title" title="${item.title}">${item.title}</div>
                    <div class="queue-item-meta">
                        <span>#${item.position}</span>
                        ${queuedTime ? `<span>${queuedTime}</span>` : ''}
                        ${item.attempts > 0 ? `<span>Retry ${item.attempts}</span>` : ''}
                    </div>
                    ${hasError ? `<div class="queue-item-error">${item.error_message}</div>` : ''}
                </div>
                <span class="queue-item-status ${statusClass}">${statusLabel}</span>
                <button class="queue-item-delete" data-vid="${item.vid}" title="Remove from queue">${trashIconSvg}</button>
            </div>
        `;
    }).join('');

    // Add event listeners to checkboxes
    queueListElement.querySelectorAll('.queue-item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', handleItemCheckboxChange);
    });

    // Add event listeners to delete buttons
    queueListElement.querySelectorAll('.queue-item-delete').forEach(button => {
        button.addEventListener('click', handleSingleDelete);
    });
}

// Function to show/hide elements based on queue
function updateQueueVisibility(queueCount) {
    const queueSection = document.getElementById('queueSection');
    const forceButton = document.getElementById('forceVintedQueue');

    const hasItems = queueCount > 0;

    if (queueSection) {
        queueSection.style.display = hasItems ? 'block' : 'none';
    }
    if (forceButton) {
        forceButton.style.display = hasItems ? 'block' : 'none';
    }
}

// Function to show force queue status message
function showForceQueueStatus(message, type) {
    const statusElement = document.getElementById('forceQueueStatus');
    if (!statusElement) return;

    statusElement.style.display = 'block';
    statusElement.className = `status-box ${type}`;
    statusElement.textContent = message;

    if (type === 'success') {
        setTimeout(() => {
            statusElement.style.display = 'none';
        }, 5000);
    }
}

// Function to handle Force Vinted Queue button click
async function handleForceVintedQueue() {
    const forceQueueButton = document.getElementById('forceVintedQueue');

    if (!currentUserId) {
        showForceQueueStatus('User not identified. Please refresh.', 'error');
        return;
    }

    forceQueueButton.disabled = true;
    forceQueueButton.innerHTML = '<span class="spinner"></span>Processing...';

    sendTelemetry('popup_force_queue_button_clicked', { uid: currentUserId });

    try {
        const response = await fetch(`${API_BASE_URL}/wp-json/fc/v1/extension-force-vinted-queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: currentUserId })
        });

        const result = await response.json();

        if (result.success) {
            showForceQueueStatus(result.message, 'success');
            if (result.first_item) {
                processingItemVid = result.first_item.vid;
            }
            setTimeout(() => loadQueueData(), 1000);
        } else {
            const statusType = result.error_code === 'auth_expired' ? 'warning' : 'error';
            showForceQueueStatus(result.message, statusType);
        }
    } catch (error) {
        console.error('Force queue error:', error);
        showForceQueueStatus('Failed to process queue. Please try again.', 'error');
        sendTelemetry('popup_force_queue_error', { uid: currentUserId, error: error.message });
    } finally {
        forceQueueButton.disabled = false;
        forceQueueButton.innerHTML = 'Force Vinted Listing Queue';
    }
}

// Function to load queue data
async function loadQueueData() {
    if (!currentUserId) {
        currentUserId = await getUserId();
        if (!currentUserId) {
            updateQueueVisibility(0);
            return;
        }
    }

    const popupData = await fetchPopupData(currentUserId);

    if (!popupData || !popupData.success) {
        updateQueueVisibility(0);
        return;
    }

    const totalCount = popupData.queue_counts?.total || 0;
    updateQueueVisibility(totalCount);
    renderQueueList(popupData.queue);
}

// Selection management functions
function handleItemCheckboxChange(event) {
    const vid = event.target.dataset.vid;
    if (event.target.checked) {
        selectedVids.add(vid);
    } else {
        selectedVids.delete(vid);
    }
    updateDeleteSelectedButton();
    updateSelectAllCheckbox();
}

function handleSelectAllChange(event) {
    const isChecked = event.target.checked;
    if (isChecked) {
        currentQueue.forEach(item => selectedVids.add(item.vid));
    } else {
        selectedVids.clear();
    }

    // Update individual checkboxes
    document.querySelectorAll('.queue-item-checkbox').forEach(checkbox => {
        checkbox.checked = isChecked;
    });

    updateDeleteSelectedButton();
}

function updateDeleteSelectedButton() {
    const deleteBtn = document.getElementById('deleteSelected');
    if (!deleteBtn) return;

    const count = selectedVids.size;
    deleteBtn.textContent = `Delete Selected (${count})`;
    deleteBtn.disabled = count === 0;
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAll');
    if (!selectAllCheckbox || currentQueue.length === 0) return;

    selectAllCheckbox.checked = selectedVids.size === currentQueue.length;
    selectAllCheckbox.indeterminate = selectedVids.size > 0 && selectedVids.size < currentQueue.length;
}

// Delete functions
function handleSingleDelete(event) {
    event.stopPropagation();
    const vid = event.currentTarget.dataset.vid;
    const item = currentQueue.find(i => i.vid === vid);
    const title = item ? item.title : 'this item';

    showConfirmModal([vid], `Are you sure you want to remove "${title}" from the listing queue?`);
}

function handleDeleteSelected() {
    const count = selectedVids.size;
    if (count === 0) return;

    const message = count === 1
        ? 'Are you sure you want to remove this item from the listing queue?'
        : `Are you sure you want to remove ${count} items from the listing queue?`;

    showConfirmModal(Array.from(selectedVids), message);
}

function showConfirmModal(vids, message) {
    pendingDeleteVids = vids;
    const modal = document.getElementById('confirmModal');
    const textElement = document.getElementById('confirmModalText');

    if (textElement) {
        textElement.textContent = message;
    }

    if (modal) {
        modal.style.display = 'flex';
    }
}

function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) {
        modal.style.display = 'none';
    }
    pendingDeleteVids = [];
}

async function executeDelete() {
    if (pendingDeleteVids.length === 0 || !currentUserId) {
        hideConfirmModal();
        return;
    }

    const vidsToDelete = [...pendingDeleteVids];
    hideConfirmModal();

    // Show loading state
    const deleteBtn = document.getElementById('deleteSelected');
    const originalText = deleteBtn ? deleteBtn.textContent : '';
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.innerHTML = '<span class="spinner"></span>Deleting...';
    }

    sendTelemetry('popup_delete_queue_items_started', {
        uid: currentUserId,
        count: vidsToDelete.length
    });

    try {
        const response = await fetch(`${API_BASE_URL}/wp-json/fc/v1/extension-delete-queue-items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                uid: currentUserId,
                vids: vidsToDelete
            })
        });

        const result = await response.json();

        if (result.success) {
            // Clear deleted items from selection
            vidsToDelete.forEach(vid => selectedVids.delete(vid));

            sendTelemetry('popup_delete_queue_items_success', {
                uid: currentUserId,
                deleted_count: result.deleted_count
            });

            // Show success message briefly
            showForceQueueStatus(result.message, 'success');

            // Reload queue data
            await loadQueueData();
        } else {
            sendTelemetry('popup_delete_queue_items_failed', {
                uid: currentUserId,
                error: result.message
            });
            showForceQueueStatus(result.message || 'Failed to delete items', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        sendTelemetry('popup_delete_queue_items_error', {
            uid: currentUserId,
            error: error.message
        });
        showForceQueueStatus('Failed to delete items. Please try again.', 'error');
    } finally {
        if (deleteBtn) {
            deleteBtn.disabled = selectedVids.size === 0;
            deleteBtn.textContent = originalText;
            updateDeleteSelectedButton();
        }
    }
}

// Initialize popup
document.addEventListener("DOMContentLoaded", async () => {
    loadVersionNumber();
    getStatus();

    currentUserId = await getUserId();
    if (currentUserId) {
        loadQueueData();
        sendTelemetry('popup_opened', { uid: currentUserId });
    }

    // Send Connection button
    document.getElementById("checkNow").addEventListener("click", () => {
        document.getElementById("status").innerText = "Checking...";
        document.getElementById("status").className = "status-box neutral";

        chrome.runtime.sendMessage({ action: "FCU_checkNow" }, () => {
            setTimeout(() => {
                getStatus();
                loadQueueData();
            }, 2000);
        });
    });

    // Force Vinted Queue button
    const forceQueueButton = document.getElementById('forceVintedQueue');
    if (forceQueueButton) {
        forceQueueButton.addEventListener('click', handleForceVintedQueue);
    }

    // Select All checkbox
    const selectAllCheckbox = document.getElementById('selectAll');
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', handleSelectAllChange);
    }

    // Delete Selected button
    const deleteSelectedBtn = document.getElementById('deleteSelected');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', handleDeleteSelected);
    }

    // Modal buttons
    const modalCancelBtn = document.getElementById('modalCancel');
    const modalConfirmBtn = document.getElementById('modalConfirm');

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', hideConfirmModal);
    }

    if (modalConfirmBtn) {
        modalConfirmBtn.addEventListener('click', executeDelete);
    }

    // Close modal on overlay click
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.addEventListener('click', (event) => {
            if (event.target === confirmModal) {
                hideConfirmModal();
            }
        });
    }

    // Refresh queue periodically
    setInterval(() => {
        if (currentUserId) loadQueueData();
    }, 10000);
});
