// Configuration
const CONFIG = {
    signalRUrl: 'https://testtests-djf3hnece0c0fdc4.australiaeast-01.azurewebsites.net',
    hubName: 'matrixhub',
    eventName: 'newMatrixData'
};

// State management
const state = {
    connection: null,
    isConnected: false,
    matrixRows: 16,
    matrixCols: 16,
    canvas: null,
    ctx: null
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Get canvas
    state.canvas = document.getElementById('heatmapCanvas');
    state.ctx = state.canvas.getContext('2d');
    
    // Set initial canvas size
    updateCanvasSize();
    
    // Setup event listeners
    document.getElementById('connectBtn').addEventListener('click', toggleConnection);
    document.getElementById('updateSize').addEventListener('click', updateMatrixSize);
    
    // Allow Enter key on matrix size input
    document.getElementById('matrixSize').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') updateMatrixSize();
    });
    
    // Update timestamp every second
    setInterval(updateCurrentTime, 1000);
    updateCurrentTime();
    
    console.log('✅ Dashboard initialized');
}

function updateMatrixSize() {
    const input = document.getElementById('matrixSize').value.trim();
    const match = input.match(/^(\d+)x(\d+)$/i);
    
    if (!match) {
        alert('Please enter dimensions in format: 8x8');
        return;
    }
    
    state.matrixRows = parseInt(match[1]);
    state.matrixCols = parseInt(match[2]);
    
    updateCanvasSize();
    console.log(`📐 Matrix size updated to ${state.matrixRows}x${state.matrixCols}`);
}

function updateCanvasSize() {
    const cellSize = 50;
    state.canvas.width = state.matrixCols * cellSize;
    state.canvas.height = state.matrixRows * cellSize;
}

async function toggleConnection() {
    if (state.isConnected) {
        await disconnect();
    } else {
        await connect();
    }
}

async function connect() {
    try {
        updateStatus('Connecting...', false);
        console.log('Calling negotiate endpoint...');
        console.log('URL:', `${CONFIG.signalRUrl}/api/negotiate`);
        
        // Get SignalR connection info from negotiate endpoint
        // Note: Removing Content-Type header to avoid CORS preflight
        const negotiateResponse = await fetch(`${CONFIG.signalRUrl}/api/negotiate`, {
            method: 'POST',
            mode: 'cors'
        });
        
        console.log('Response status:', negotiateResponse.status);
        console.log('Response ok:', negotiateResponse.ok);
        
        if (!negotiateResponse.ok) {
            const errorText = await negotiateResponse.text();
            console.error('Error response:', errorText);
            throw new Error(`Negotiate failed: ${negotiateResponse.status} - ${errorText}`);
        }
        
        const connectionInfo = await negotiateResponse.json();
        console.log('✅ Negotiate successful');
        console.log('Connection info:', connectionInfo);
        
        // Build SignalR connection with the returned URL and access token
        state.connection = new signalR.HubConnectionBuilder()
            .withUrl(connectionInfo.Url || connectionInfo.url, {
                accessTokenFactory: () => connectionInfo.AccessToken || connectionInfo.accessToken
            })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Information)
            .build();
        
        // Setup event handlers
        state.connection.on(CONFIG.eventName, handleMatrixData);
        
        state.connection.onreconnecting(() => {
            console.log('🔄 Reconnecting...');
            updateStatus('Reconnecting...', false);
        });
        
        state.connection.onreconnected(() => {
            console.log('✅ Reconnected');
            updateStatus('Connected', true);
        });
        
        state.connection.onclose(() => {
            console.log('❌ Connection closed');
            updateStatus('Disconnected', false);
            state.isConnected = false;
            document.getElementById('connectBtn').textContent = 'Connect to SignalR';
            document.getElementById('connectBtn').disabled = false;
        });
        
        // Start connection
        await state.connection.start();
        console.log('✅ Connected to SignalR');
        
        state.isConnected = true;
        updateStatus('Connected', true);
        document.getElementById('connectBtn').textContent = 'Disconnect';
        
    } catch (error) {
        console.error('❌ Connection failed:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        updateStatus('Connection Failed', false);
        
        let errorMessage = `Failed to connect: ${error.message}`;
        if (error.message.includes('Failed to fetch')) {
            errorMessage += '\n\nPossible causes:\n' +
                '1. Function app is not running or not accessible\n' +
                '2. CORS is not configured correctly\n' +
                '3. Network/firewall blocking the request\n\n' +
                'Check browser console (F12) for more details.';
        }
        
        alert(errorMessage);
        document.getElementById('connectBtn').disabled = false;
    }
}

async function disconnect() {
    try {
        if (state.connection) {
            await state.connection.stop();
            state.connection = null;
        }
        state.isConnected = false;
        updateStatus('Disconnected', false);
        document.getElementById('connectBtn').textContent = 'Connect to SignalR';
        console.log('✅ Disconnected');
    } catch (error) {
        console.error('❌ Disconnect error:', error);
    }
}

function handleMatrixData(data) {
    console.log('📥 Received matrix data:', data);
    console.log('Data type:', Array.isArray(data) ? 'Array' : 'Object');
    
    try {
        let base64Matrix;
        let timestamp;
        
        // Handle both array and object formats
        if (Array.isArray(data)) {
            // Data is an array: [timestamp, matrix_base64, topic, ...]
            console.log('📦 Data is an array, extracting values...');
            timestamp = data[0];
            base64Matrix = data[1];
        } else {
            // Data is an object: {timestamp, matrix_base64, topic, ...}
            console.log('📦 Data is an object, extracting values...');
            timestamp = data.timestamp || data.Timestamp;
            base64Matrix = data.matrix_base64 || data.base64_matrix || data.Base64_matrix || data.Base64_Matrix;
        }
        
        console.log('base64Matrix found:', !!base64Matrix);
        console.log('base64Matrix value:', base64Matrix);
        
        if (!base64Matrix) {
            console.error('❌ No matrix data found');
            console.error('Data keys:', Array.isArray(data) ? `Array length: ${data.length}` : Object.keys(data));
            return;
        }
        
        const matrixData = decodeBase64Matrix(base64Matrix);
        
        // Draw heatmap
        drawHeatmap(matrixData);
        
        // Update timestamp
        const displayTimestamp = timestamp || new Date().toISOString();
        updateTimestamp(displayTimestamp);
        
        // Update stats
        updateStats(matrixData);
        
    } catch (error) {
        console.error('❌ Error processing matrix data:', error);
    }
}

function decodeBase64Matrix(base64String) {
    // Decode base64 to binary string
    const binaryString = atob(base64String);
    
    // Convert to byte array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Convert bytes to temperature matrix
    const totalCells = state.matrixRows * state.matrixCols;
    const matrix = [];
    
    for (let i = 0; i < totalCells && i < bytes.length; i++) {
        matrix.push(bytes[i]);
    }
    
    return matrix;
}

function drawHeatmap(matrixData) {
    const cellWidth = state.canvas.width / state.matrixCols;
    const cellHeight = state.canvas.height / state.matrixRows;
    
    // Find min and max for color scaling
    const min = Math.min(...matrixData);
    const max = Math.max(...matrixData);
    const range = max - min || 1;
    
    // Clear canvas
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    
    // Draw each cell
    for (let i = 0; i < matrixData.length; i++) {
        const row = Math.floor(i / state.matrixCols);
        const col = i % state.matrixCols;
        
        const x = col * cellWidth;
        const y = row * cellHeight;
        
        // Normalize temperature to 0-1 range
        const normalized = (matrixData[i] - min) / range;
        
        // Get color from temperature
        const color = getHeatmapColor(normalized);
        
        // Draw cell
        state.ctx.fillStyle = color;
        state.ctx.fillRect(x, y, cellWidth, cellHeight);
        
        // Draw border
        state.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        state.ctx.lineWidth = 1;
        state.ctx.strokeRect(x, y, cellWidth, cellHeight);
        
        // Draw temperature text
        state.ctx.fillStyle = normalized > 0.5 ? 'white' : 'black';
        state.ctx.font = `${Math.min(cellWidth, cellHeight) * 0.3}px Arial`;
        state.ctx.textAlign = 'center';
        state.ctx.textBaseline = 'middle';
        state.ctx.fillText(
            matrixData[i].toFixed(0),
            x + cellWidth / 2,
            y + cellHeight / 2
        );
    }
}

function getHeatmapColor(normalized) {
    // Color gradient: Blue -> Cyan -> Green -> Yellow -> Red
    const colors = [
        { pos: 0.0, r: 0, g: 0, b: 255 },     // Blue
        { pos: 0.25, r: 0, g: 255, b: 255 },  // Cyan
        { pos: 0.5, r: 0, g: 255, b: 0 },     // Green
        { pos: 0.75, r: 255, g: 255, b: 0 },  // Yellow
        { pos: 1.0, r: 255, g: 0, b: 0 }      // Red
    ];
    
    // Find the two colors to interpolate between
    let startColor = colors[0];
    let endColor = colors[colors.length - 1];
    
    for (let i = 0; i < colors.length - 1; i++) {
        if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {
            startColor = colors[i];
            endColor = colors[i + 1];
            break;
        }
    }
    
    // Interpolate
    const range = endColor.pos - startColor.pos;
    const localNorm = (normalized - startColor.pos) / range;
    
    const r = Math.round(startColor.r + (endColor.r - startColor.r) * localNorm);
    const g = Math.round(startColor.g + (endColor.g - startColor.g) * localNorm);
    const b = Math.round(startColor.b + (endColor.b - startColor.b) * localNorm);
    
    return `rgb(${r}, ${g}, ${b})`;
}

function updateStats(matrixData) {
    if (matrixData.length === 0) return;
    
    const min = Math.min(...matrixData);
    const max = Math.max(...matrixData);
    const avg = matrixData.reduce((sum, val) => sum + val, 0) / matrixData.length;
    
    document.getElementById('minTemp').textContent = `Min: ${min.toFixed(1)}°C`;
    document.getElementById('maxTemp').textContent = `Max: ${max.toFixed(1)}°C`;
    document.getElementById('avgTemp').textContent = `Avg: ${avg.toFixed(1)}°C`;
}

function updateStatus(text, connected) {
    document.getElementById('statusText').textContent = text;
    const indicator = document.getElementById('statusIndicator');
    if (connected) {
        indicator.classList.add('connected');
    } else {
        indicator.classList.remove('connected');
    }
}

function updateTimestamp(isoString) {
    const date = new Date(isoString);
    const formatted = date.toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('timestamp').textContent = formatted;
}

function updateCurrentTime() {
    if (!state.isConnected) {
        const now = new Date().toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('timestamp').textContent = now;
    }
}
