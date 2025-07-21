// Function to display status in the popup
function displayStatus(statusData) {
    const statusElement = document.getElementById("status");
    
    // Clear existing classes
    statusElement.classList.remove("success", "error", "neutral");
    
    if (!statusData) {
        statusElement.innerText = "No status available";
        statusElement.classList.add("neutral");
        return;
    }
    
    // Format the timestamp if it exists
    let formattedTime = "";
    if (statusData.timestamp) {
        const date = new Date(statusData.timestamp);
        formattedTime = ` (${date.toLocaleString()})`;
    }
    
    statusElement.innerText = statusData.message + formattedTime;
    
    // Add the appropriate class based on success status
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

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
    // Load the current status
    getStatus();
    
    // Handle the Check Now button
    document.getElementById("checkNow").addEventListener("click", () => {
        document.getElementById("status").innerText = "Checking...";
        document.getElementById("status").className = "status-box neutral";
        
        chrome.runtime.sendMessage({ action: "FCU_checkNow" }, () => {
            // Wait a moment for the check to complete
            setTimeout(getStatus, 1000);
        });
    });
});
