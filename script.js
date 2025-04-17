// BLE UART Service UUIDs (Nordic UART Service)
const UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const UART_TX_CHARACTERISTIC_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // RX on the device
const UART_RX_CHARACTERISTIC_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // TX on the device

let bleDevice = null;
let bleServer = null;
let rxCharacteristic = null;
let txCharacteristic = null;
let isConnected = false;

// Data storage
const maxDataPoints = 50;
const altitudeData = {
    timestamps: [],
    values: []
};

// Chart reference
let altitudeChart = null;

// DOM elements
const connectBtn = document.getElementById('connectBtn');
const connectionStatus = document.getElementById('connectionStatus');
const currentAltitude = document.getElementById('currentAltitude');
const elevationChange = document.getElementById('elevationChange');
const motionStatus = document.getElementById('motionStatus');
const ledRed = document.getElementById('ledRed');
const ledGreen = document.getElementById('ledGreen');
const ledBlue = document.getElementById('ledBlue');
const logContainer = document.getElementById('logContainer');
const clearLogBtn = document.getElementById('clearLogBtn');

// Check if Web Bluetooth is available
if (!navigator.bluetooth) {
    addLogEntry('Web Bluetooth is not supported in this browser!', true);
    connectBtn.disabled = true;
    connectBtn.textContent = 'Bluetooth Not Supported';
}

// Initialize the page
function initialize() {
    // Set up event listeners
    connectBtn.addEventListener('click', toggleConnection);
    clearLogBtn.addEventListener('click', clearLog);
    
    // Initialize the chart
    initChart();
    
    addLogEntry('Page loaded. Ready to connect.');
}

// Initialize the altitude chart
function initChart() {
    const ctx = document.getElementById('altitudeChart').getContext('2d');
    altitudeChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Altitude (m)',
                data: [],
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                borderWidth: 2,
                tension: 0.2,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false
                },
                x: {
                    display: false
                }
            },
            plugins: {
                legend: {
                    display: false
                }
            },
            animation: {
                duration: 0 // Disables animation for better performance
            }
        }
    });
}

// Toggle BLE connection
async function toggleConnection() {
    if (isConnected) {
        disconnectFromDevice();
    } else {
        connectToDevice();
    }
}

// Connect to BLE device
async function connectToDevice() {
    try {
        addLogEntry('Requesting Bluetooth device...');
        
        // Request the BLE device
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { services: [UART_SERVICE_UUID] }
                // Alternatively, you can use name filters if your device advertises a specific name
                // { name: 'YourDeviceName' }
            ],
            optionalServices: [UART_SERVICE_UUID]
        });
        
        addLogEntry(`Device selected: ${bleDevice.name || 'Unknown device'}`);
        
        // Add event listener for disconnection
        bleDevice.addEventListener('gattserverdisconnected', onDisconnected);
        
        // Connect to the GATT server
        addLogEntry('Connecting to GATT server...');
        bleServer = await bleDevice.gatt.connect();
        
        // Get the UART service
        addLogEntry('Getting UART service...');
        const service = await bleServer.getPrimaryService(UART_SERVICE_UUID);
        
        // Get the RX and TX characteristics
        addLogEntry('Getting UART characteristics...');
        rxCharacteristic = await service.getCharacteristic(UART_RX_CHARACTERISTIC_UUID);
        txCharacteristic = await service.getCharacteristic(UART_TX_CHARACTERISTIC_UUID);
        
        // Start notifications on RX characteristic (device -> web app)
        await rxCharacteristic.startNotifications();
        rxCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);
        
        isConnected = true;
        updateConnectionStatus(true);
        addLogEntry('Connected successfully!');
        
    } catch (error) {
        addLogEntry(`Connection error: ${error}`, true);
        disconnectFromDevice();
    }
}

// Handle incoming BLE notifications
function handleNotifications(event) {
    const value = event.target.value;
    const decoder = new TextDecoder();
    const data = decoder.decode(value);
    
    // Add to log
    addLogEntry(`Data: ${data}`);
    
    // Process the data
    processSerialData(data);
}

// Process the serial data from the device
function processSerialData(data) {
    // Check for altitude data format
    const altitudeMatch = data.match(/Altitude: ([0-9.]+) m, Change: ([0-9.-]+) cm, IMU Motion: ([A-Z]+)/);
    
    if (altitudeMatch) {
        const altitude = parseFloat(altitudeMatch[1]);
        const change = parseFloat(altitudeMatch[2]);
        const motion = altitudeMatch[3];
        
        // Update UI with the parsed data
        updateAltitudeDisplay(altitude, change, motion);
        
        // Add data point to chart
        addDataPoint(altitude);
    }
    
    // Check for LED status (not included in serial output, but we can simulate based on data)
    if (altitudeMatch) {
        const change = parseFloat(altitudeMatch[2]);
        const motion = altitudeMatch[3];
        
        // Update LEDs based on the data
        ledRed.classList.toggle('active', motion === 'UP' && change > 0);
        ledGreen.classList.toggle('active', change < 0);
        ledBlue.classList.toggle('active', Math.abs(change) < 0.5); // Low change might indicate drift/calibration
    }
}

// Update the altitude display elements
function updateAltitudeDisplay(altitude, change, motion) {
    currentAltitude.textContent = `${altitude.toFixed(2)} m`;
    elevationChange.textContent = `${change.toFixed(2)} cm`;
    motionStatus.textContent = motion;
    
    // Add classes for styling based on motion
    if (motion === 'UP' && change > 0) {
        elevationChange.classList.add('rising');
        elevationChange.classList.remove('falling');
    } else if (change < 0) {
        elevationChange.classList.add('falling');
        elevationChange.classList.remove('rising');
    } else {
        elevationChange.classList.remove('rising', 'falling');
    }
}

// Add a data point to the chart
function addDataPoint(altitude) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    
    // Add new data
    altitudeData.timestamps.push(timestamp);
    altitudeData.values.push(altitude);
    
    // Limit the number of data points
    if (altitudeData.timestamps.length > maxDataPoints) {
        altitudeData.timestamps.shift();
        altitudeData.values.shift();
    }
    
    // Update chart
    altitudeChart.data.labels = altitudeData.timestamps;
    altitudeChart.data.datasets[0].data = altitudeData.values;
    altitudeChart.update();
}

// Handle device disconnection
function onDisconnected() {
    isConnected = false;
    updateConnectionStatus(false);
    addLogEntry('Device disconnected.', true);
    
    // Reset device-related variables
    bleServer = null;
    rxCharacteristic = null;
    txCharacteristic = null;
}

// Disconnect from the device
function disconnectFromDevice() {
    try {
        connectBtn.classList.add('disconnecting');
        connectBtn.textContent = 'Disconnecting...';
        
        if (bleDevice && bleDevice.gatt.connected) {
            bleDevice.gatt.disconnect();
        } else {
            onDisconnected();
        }
    } catch (error) {
        addLogEntry(`Disconnection error: ${error}`, true);
        updateConnectionStatus(false);
    }
}

// Update the connection status display
function updateConnectionStatus(connected) {
    isConnected = connected;
    
    if (connected) {
        connectionStatus.textContent = 'Connected';
        connectionStatus.classList.add('connected');
        connectBtn.textContent = 'Disconnect';
    } else {
        connectionStatus.textContent = 'Disconnected';
        connectionStatus.classList.remove('connected');
        connectBtn.textContent = 'Connect to Device';
        connectBtn.classList.remove('disconnecting');
        
        // Reset LEDs
        ledRed.classList.remove('active');
        ledGreen.classList.remove('active');
        ledBlue.classList.remove('active');
    }
}

// Add an entry to the log
function addLogEntry(message, isError = false) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time-stamp';
    timeSpan.textContent = timestamp;
    
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    if (isError) {
        messageSpan.style.color = 'red';
    }
    
    logEntry.appendChild(timeSpan);
    logEntry.appendChild(messageSpan);
    
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // Limit log entries to prevent memory issues
    while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

// Clear the log
function clearLog() {
    while (logContainer.firstChild) {
        logContainer.removeChild(logContainer.firstChild);
    }
    addLogEntry('Log cleared.');
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initialize);