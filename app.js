// Configuration// Configuration

const CONFIG = {const CONFIG = {

    signalRUrl: 'https://testtests-djf3hnece0c0fdc4.australiaeast-01.azurewebsites.net',    signalRUrl: 'https://testtests-djf3hnece0c0fdc4.australiaeast-01.azurewebsites.net',

    hubName: 'matrixhub',    hubName: 'matrixhub',

    eventName: 'newMatrixData'    eventName: 'newMatrixData'

};};



// State management// State management

const state = {const state = {

    connection: null,    connection: null,

    isConnected: false,    isConnected: false,

    matrixRows: 16,    matrixRows: 16,

    matrixCols: 16,    matrixCols: 16,

    canvas: null,    canvas: null,

    ctx: null    ctx: null

};};



// Initialize when DOM is ready// Initialize when DOM is ready

document.addEventListener('DOMContentLoaded', () => {document.addEventListener('DOMContentLoaded', () => {

    initializeApp();    initializeApp();

});});



function initializeApp() {function initializeApp() {

    // Get canvas    // Get canvas

    state.canvas = document.getElementById('heatmapCanvas');    state.canvas = document.getElementById('heatmapCanvas');

    state.ctx = state.canvas.getContext('2d');    state.ctx = state.canvas.getContext('2d');

        

    // Set initial canvas size    // Set initial canvas size

    updateCanvasSize();    updateCanvasSize();

        

    // Setup event listeners    // Setup event listeners

    document.getElementById('connectBtn').addEventListener('click', toggleConnection);    document.getElementById('connectBtn').addEventListener('click', toggleConnection);

    document.getElementById('updateSize').addEventListener('click', updateMatrixSize);    document.getElementById('updateSize').addEventListener('click', updateMatrixSize);

        

    // Allow Enter key on matrix size input    // Allow Enter key on matrix size input

    document.getElementById('matrixSize').addEventListener('keypress', (e) => {    document.getElementById('matrixSize').addEventListener('keypress', (e) => {

        if (e.key === 'Enter') updateMatrixSize();        if (e.key === 'Enter') updateMatrixSize();

    });    });

        

    // Update timestamp every second    // Update timestamp every second

    setInterval(updateCurrentTime, 1000);    setInterval(updateCurrentTime, 1000);

    updateCurrentTime();    updateCurrentTime();

        

    console.log('✅ Dashboard initialized');    console.log('✅ Dashboard initialized');

}}



function updateMatrixSize() {function updateMatrixSize() {

    const input = document.getElementById('matrixSize').value.trim();    const input = document.getElementById('matrixSize').value.trim();

    const match = input.match(/^(\d+)x(\d+)$/i);    const match = input.match(/^(\d+)x(\d+)$/i);

        

    if (!match) {    if (!match) {

        alert('Please enter dimensions in format: 8x8');        alert('Please enter dimensions in format: 8x8');

        return;        return;

    }    }

        

    state.matrixRows = parseInt(match[1]);    state.matrixRows = parseInt(match[1]);

    state.matrixCols = parseInt(match[2]);    state.matrixCols = parseInt(match[2]);

        

    updateCanvasSize();    updateCanvasSize();

    console.log(`📐 Matrix size updated to ${state.matrixRows}x${state.matrixCols}`);    console.log(`📐 Matrix size updated to ${state.matrixRows}x${state.matrixCols}`);

}}



function updateCanvasSize() {function updateCanvasSize() {

    const cellSize = 50;    const cellSize = 50;

    state.canvas.width = state.matrixCols * cellSize;    state.canvas.width = state.matrixCols * cellSize;

    state.canvas.height = state.matrixRows * cellSize;    state.canvas.height = state.matrixRows * cellSize;

}}



async function toggleConnection() {async function toggleConnection() {

    if (state.isConnected) {    if (state.isConnected) {

        await disconnect();        await disconnect();

    } else {    } else {

        await connect();        await connect();

    }    }

}}



async function connect() {async function connect() {

    try {    try {

        updateStatus('Connecting...', false);        updateStatus('Connecting...', false);

        console.log('Calling negotiate endpoint...');        console.log('Calling negotiate endpoint...');

        console.log('URL:', `${CONFIG.signalRUrl}/api/negotiate`);        console.log('URL:', `${CONFIG.signalRUrl}/api/negotiate`);

                

        // Get SignalR connection info from negotiate endpoint        // Get SignalR connection info from negotiate endpoint

        const negotiateResponse = await fetch(`${CONFIG.signalRUrl}/api/negotiate`, {        // Note: Removing Content-Type header to avoid CORS preflight

            method: 'POST',        const negotiateResponse = await fetch(`${CONFIG.signalRUrl}/api/negotiate`, {

            mode: 'cors'            method: 'POST',

        });            mode: 'cors'

                });

        console.log('Response status:', negotiateResponse.status);        

        console.log('Response ok:', negotiateResponse.ok);        console.log('Response status:', negotiateResponse.status);

                console.log('Response ok:', negotiateResponse.ok);

        if (!negotiateResponse.ok) {        

            const errorText = await negotiateResponse.text();        if (!negotiateResponse.ok) {

            console.error('Error response:', errorText);            const errorText = await negotiateResponse.text();

            throw new Error(`Negotiate failed: ${negotiateResponse.status} - ${errorText}`);            console.error('Error response:', errorText);

        }            throw new Error(`Negotiate failed: ${negotiateResponse.status} - ${errorText}`);

                }

        const connectionInfo = await negotiateResponse.json();        

        console.log('✅ Negotiate successful');        const connectionInfo = await negotiateResponse.json();

        console.log('Connection info:', connectionInfo);        console.log('✅ Negotiate successful');

                console.log('Connection info:', connectionInfo);

        // Build SignalR connection with the returned URL and access token        

        state.connection = new signalR.HubConnectionBuilder()        // Build SignalR connection with the returned URL and access token

            .withUrl(connectionInfo.Url || connectionInfo.url, {        state.connection = new signalR.HubConnectionBuilder()

                accessTokenFactory: () => connectionInfo.AccessToken || connectionInfo.accessToken            .withUrl(connectionInfo.Url || connectionInfo.url, {

            })                accessTokenFactory: () => connectionInfo.AccessToken || connectionInfo.accessToken

            .withAutomaticReconnect()            })

            .configureLogging(signalR.LogLevel.Information)            .withAutomaticReconnect()

            .build();            .configureLogging(signalR.LogLevel.Information)

                    .build();

        // Setup event handlers        

        state.connection.on(CONFIG.eventName, handleMatrixData);        // Setup event handlers

                state.connection.on(CONFIG.eventName, handleMatrixData);

        state.connection.onreconnecting(() => {        

            console.log('🔄 Reconnecting...');        state.connection.onreconnecting(() => {

            updateStatus('Reconnecting...', false);            console.log('🔄 Reconnecting...');

        });            updateStatus('Reconnecting...', false);

                });

        state.connection.onreconnected(() => {        

            console.log('✅ Reconnected');        state.connection.onreconnected(() => {

            updateStatus('Connected', true);            console.log('✅ Reconnected');

        });            updateStatus('Connected', true);

                });

        state.connection.onclose(() => {        

            console.log('❌ Connection closed');        state.connection.onclose(() => {

            updateStatus('Disconnected', false);            console.log('❌ Connection closed');

            state.isConnected = false;            updateStatus('Disconnected', false);

            document.getElementById('connectBtn').textContent = 'Connect to SignalR';            state.isConnected = false;

            document.getElementById('connectBtn').disabled = false;            document.getElementById('connectBtn').textContent = 'Connect to SignalR';

        });            document.getElementById('connectBtn').disabled = false;

                });

        // Start connection        

        await state.connection.start();        // Start connection

        console.log('✅ Connected to SignalR');        await state.connection.start();

                console.log('✅ Connected to SignalR');

        state.isConnected = true;        

        updateStatus('Connected', true);        state.isConnected = true;

        document.getElementById('connectBtn').textContent = 'Disconnect';        updateStatus('Connected', true);

                document.getElementById('connectBtn').textContent = 'Disconnect';

    } catch (error) {        

        console.error('❌ Connection failed:', error);    } catch (error) {

        console.error('Error details:', {        console.error('❌ Connection failed:', error);

            message: error.message,        console.error('Error details:', {

            stack: error.stack,            message: error.message,

            name: error.name            stack: error.stack,

        });            name: error.name

        updateStatus('Connection Failed', false);        });

                updateStatus('Connection Failed', false);

        let errorMessage = `Failed to connect: ${error.message}`;        

        if (error.message.includes('Failed to fetch')) {        let errorMessage = `Failed to connect: ${error.message}`;

            errorMessage += '\n\nPossible causes:\n' +        if (error.message.includes('Failed to fetch')) {

                '1. Function app is not running or not accessible\n' +            errorMessage += '\n\nPossible causes:\n' +

                '2. CORS is not configured correctly\n' +                '1. Function app is not running or not accessible\n' +

                '3. Network/firewall blocking the request\n\n' +                '2. CORS is not configured correctly\n' +

                'Check browser console (F12) for more details.';                '3. Network/firewall blocking the request\n\n' +

        }                'Check browser console (F12) for more details.';

                }

        alert(errorMessage);        

        document.getElementById('connectBtn').disabled = false;        alert(errorMessage);

    }        document.getElementById('connectBtn').disabled = false;

}    }

}

async function disconnect() {

    try {async function disconnect() {

        if (state.connection) {    try {

            await state.connection.stop();        if (state.connection) {

            state.connection = null;            await state.connection.stop();

        }            state.connection = null;

        state.isConnected = false;        }

        updateStatus('Disconnected', false);        state.isConnected = false;

        document.getElementById('connectBtn').textContent = 'Connect to SignalR';        updateStatus('Disconnected', false);

        console.log('✅ Disconnected');        document.getElementById('connectBtn').textContent = 'Connect to SignalR';

    } catch (error) {        console.log('✅ Disconnected');

        console.error('❌ Disconnect error:', error);    } catch (error) {

    }        console.error('❌ Disconnect error:', error);

}    }

}

function handleMatrixData(data) {

    console.log('📥 Received matrix data:', data);function handleMatrixData(data) {

    console.log('Data type:', Array.isArray(data) ? 'Array' : typeof data);    console.log('📥 Received matrix data:', data);

    console.log('Data length:', Array.isArray(data) ? data.length : Object.keys(data).length);    console.log('Data type:', Array.isArray(data) ? 'Array' : 'Object');

        

    try {    try {

        let base64Matrix;        let base64Matrix;

        let timestamp;        let timestamp;

                

        // If it's an array, try to reconstruct the JSON string from bytes        // Handle both array and object formats

        if (Array.isArray(data)) {        if (Array.isArray(data)) {

            console.log('📦 Data is an array of', data.length, 'elements, attempting to reconstruct...');            // Data is an array: [timestamp, matrix_base64, topic, ...]

            // Try converting array of bytes to string            console.log('📦 Data is an array, extracting values...');

            const str = String.fromCharCode(...data);            timestamp = data[0];

            console.log('📝 Reconstructed string (first 100 chars):', str.substring(0, 100));            base64Matrix = data[1];

            try {        } else {

                const parsed = JSON.parse(str);            // Data is an object: {timestamp, matrix_base64, topic, ...}

                timestamp = parsed.timestamp;            console.log('� Data is an object, extracting values...');

                base64Matrix = parsed.matrix_base64;            timestamp = data.timestamp || data.Timestamp;

            } catch (e) {            base64Matrix = data.base64_matrix || data.Base64_matrix || data.Base64_Matrix || data.matrix_base64;

                console.error('Failed to parse as JSON:', e);        }

                return;        

            }        console.log('base64Matrix found:', !!base64Matrix);

        }        

        // Check if data is a string (JSON serialized)        if (!base64Matrix) {

        else if (typeof data === 'string') {            console.error('❌ No matrix data found');

            console.log('📦 Data is a string, parsing JSON...');            console.error('Data keys:', Array.isArray(data) ? `Array length: ${data.length}` : Object.keys(data));

            const parsed = JSON.parse(data);            return;

            timestamp = parsed.timestamp;        }

            base64Matrix = parsed.matrix_base64;        

        }        const matrixData = decodeBase64Matrix(base64Matrix);

        // Check if data is an object with properties        

        else if (data && typeof data === 'object') {        // Draw heatmap

            console.log('📦 Data is an object...');        drawHeatmap(matrixData);

            timestamp = data.timestamp || data.Timestamp;        

            base64Matrix = data.base64_matrix || data.Base64_matrix || data.Base64_Matrix || data.matrix_base64;        // Update timestamp

        }        const displayTimestamp = timestamp || new Date().toISOString();

                updateTimestamp(displayTimestamp);

        console.log('✅ Extracted - timestamp:', timestamp ? 'yes' : 'no', ', base64Matrix length:', base64Matrix ? base64Matrix.length : 'none');        

                // Update stats

        if (!base64Matrix) {        updateStats(matrixData);

            console.error('❌ No matrix data found');        

            return;    } catch (error) {

        }        console.error('❌ Error processing matrix data:', error);

            }

        const matrixData = decodeBase64Matrix(base64Matrix);}

        console.log('✅ Decoded matrix with', matrixData.length, 'cells');

        function decodeBase64Matrix(base64String) {

        // Draw heatmap    // Decode base64 to binary string

        drawHeatmap(matrixData);    const binaryString = atob(base64String);

            

        // Update timestamp    // Convert to byte array

        const displayTimestamp = timestamp || new Date().toISOString();    const bytes = new Uint8Array(binaryString.length);

        updateTimestamp(displayTimestamp);    for (let i = 0; i < binaryString.length; i++) {

                bytes[i] = binaryString.charCodeAt(i);

        // Update stats    }

        updateStats(matrixData);    

            // Convert bytes to temperature matrix

    } catch (error) {    const totalCells = state.matrixRows * state.matrixCols;

        console.error('❌ Error processing matrix data:', error);    const matrix = [];

    }    

}    for (let i = 0; i < totalCells && i < bytes.length; i++) {

        matrix.push(bytes[i]);

function decodeBase64Matrix(base64String) {    }

    // Decode base64 to binary string    

    const binaryString = atob(base64String);    return matrix;

    }

    // Convert to byte array

    const bytes = new Uint8Array(binaryString.length);function drawHeatmap(matrixData) {

    for (let i = 0; i < binaryString.length; i++) {    const cellWidth = state.canvas.width / state.matrixCols;

        bytes[i] = binaryString.charCodeAt(i);    const cellHeight = state.canvas.height / state.matrixRows;

    }    

        // Find min and max for color scaling

    // Convert bytes to temperature matrix    const min = Math.min(...matrixData);

    const totalCells = state.matrixRows * state.matrixCols;    const max = Math.max(...matrixData);

    const matrix = [];    const range = max - min || 1;

        

    for (let i = 0; i < totalCells && i < bytes.length; i++) {    // Clear canvas

        matrix.push(bytes[i]);    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);

    }    

        // Draw each cell

    return matrix;    for (let i = 0; i < matrixData.length; i++) {

}        const row = Math.floor(i / state.matrixCols);

        const col = i % state.matrixCols;

function drawHeatmap(matrixData) {        

    const cellWidth = state.canvas.width / state.matrixCols;        const x = col * cellWidth;

    const cellHeight = state.canvas.height / state.matrixRows;        const y = row * cellHeight;

            

    // Find min and max for color scaling        // Normalize temperature to 0-1 range

    const min = Math.min(...matrixData);        const normalized = (matrixData[i] - min) / range;

    const max = Math.max(...matrixData);        

    const range = max - min || 1;        // Get color from temperature

            const color = getHeatmapColor(normalized);

    // Clear canvas        

    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);        // Draw cell

            state.ctx.fillStyle = color;

    // Draw each cell        state.ctx.fillRect(x, y, cellWidth, cellHeight);

    for (let i = 0; i < matrixData.length; i++) {        

        const row = Math.floor(i / state.matrixCols);        // Draw border

        const col = i % state.matrixCols;        state.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';

                state.ctx.lineWidth = 1;

        const x = col * cellWidth;        state.ctx.strokeRect(x, y, cellWidth, cellHeight);

        const y = row * cellHeight;        

                // Draw temperature text

        // Normalize temperature to 0-1 range        state.ctx.fillStyle = normalized > 0.5 ? 'white' : 'black';

        const normalized = (matrixData[i] - min) / range;        state.ctx.font = `${Math.min(cellWidth, cellHeight) * 0.3}px Arial`;

                state.ctx.textAlign = 'center';

        // Get color from temperature        state.ctx.textBaseline = 'middle';

        const color = getHeatmapColor(normalized);        state.ctx.fillText(

                    matrixData[i].toFixed(0),

        // Draw cell            x + cellWidth / 2,

        state.ctx.fillStyle = color;            y + cellHeight / 2

        state.ctx.fillRect(x, y, cellWidth, cellHeight);        );

            }

        // Draw border}

        state.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';

        state.ctx.lineWidth = 1;function getHeatmapColor(normalized) {

        state.ctx.strokeRect(x, y, cellWidth, cellHeight);    // Color gradient: Blue -> Cyan -> Green -> Yellow -> Red

            const colors = [

        // Draw temperature text        { pos: 0.0, r: 0, g: 0, b: 255 },     // Blue

        state.ctx.fillStyle = normalized > 0.5 ? 'white' : 'black';        { pos: 0.25, r: 0, g: 255, b: 255 },  // Cyan

        state.ctx.font = `${Math.min(cellWidth, cellHeight) * 0.3}px Arial`;        { pos: 0.5, r: 0, g: 255, b: 0 },     // Green

        state.ctx.textAlign = 'center';        { pos: 0.75, r: 255, g: 255, b: 0 },  // Yellow

        state.ctx.textBaseline = 'middle';        { pos: 1.0, r: 255, g: 0, b: 0 }      // Red

        state.ctx.fillText(    ];

            matrixData[i].toFixed(0),    

            x + cellWidth / 2,    // Find the two colors to interpolate between

            y + cellHeight / 2    let startColor = colors[0];

        );    let endColor = colors[colors.length - 1];

    }    

}    for (let i = 0; i < colors.length - 1; i++) {

        if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {

function getHeatmapColor(normalized) {            startColor = colors[i];

    // Color gradient: Blue -> Cyan -> Green -> Yellow -> Red            endColor = colors[i + 1];

    const colors = [            break;

        { pos: 0.0, r: 0, g: 0, b: 255 },     // Blue        }

        { pos: 0.25, r: 0, g: 255, b: 255 },  // Cyan    }

        { pos: 0.5, r: 0, g: 255, b: 0 },     // Green    

        { pos: 0.75, r: 255, g: 255, b: 0 },  // Yellow    // Interpolate

        { pos: 1.0, r: 255, g: 0, b: 0 }      // Red    const range = endColor.pos - startColor.pos;

    ];    const localNorm = (normalized - startColor.pos) / range;

        

    // Find the two colors to interpolate between    const r = Math.round(startColor.r + (endColor.r - startColor.r) * localNorm);

    let startColor = colors[0];    const g = Math.round(startColor.g + (endColor.g - startColor.g) * localNorm);

    let endColor = colors[colors.length - 1];    const b = Math.round(startColor.b + (endColor.b - startColor.b) * localNorm);

        

    for (let i = 0; i < colors.length - 1; i++) {    return `rgb(${r}, ${g}, ${b})`;

        if (normalized >= colors[i].pos && normalized <= colors[i + 1].pos) {}

            startColor = colors[i];

            endColor = colors[i + 1];function updateStats(matrixData) {

            break;    if (matrixData.length === 0) return;

        }    

    }    const min = Math.min(...matrixData);

        const max = Math.max(...matrixData);

    // Interpolate    const avg = matrixData.reduce((sum, val) => sum + val, 0) / matrixData.length;

    const range = endColor.pos - startColor.pos;    

    const localNorm = (normalized - startColor.pos) / range;    document.getElementById('minTemp').textContent = `Min: ${min.toFixed(1)}°C`;

        document.getElementById('maxTemp').textContent = `Max: ${max.toFixed(1)}°C`;

    const r = Math.round(startColor.r + (endColor.r - startColor.r) * localNorm);    document.getElementById('avgTemp').textContent = `Avg: ${avg.toFixed(1)}°C`;

    const g = Math.round(startColor.g + (endColor.g - startColor.g) * localNorm);}

    const b = Math.round(startColor.b + (endColor.b - startColor.b) * localNorm);

    function updateStatus(text, connected) {

    return `rgb(${r}, ${g}, ${b})`;    document.getElementById('statusText').textContent = text;

}    const indicator = document.getElementById('statusIndicator');

    if (connected) {

function updateStats(matrixData) {        indicator.classList.add('connected');

    if (matrixData.length === 0) return;    } else {

            indicator.classList.remove('connected');

    const min = Math.min(...matrixData);    }

    const max = Math.max(...matrixData);}

    const avg = matrixData.reduce((sum, val) => sum + val, 0) / matrixData.length;

    function updateTimestamp(isoString) {

    document.getElementById('minTemp').textContent = `Min: ${min.toFixed(1)}°C`;    const date = new Date(isoString);

    document.getElementById('maxTemp').textContent = `Max: ${max.toFixed(1)}°C`;    const formatted = date.toLocaleTimeString('en-US', { 

    document.getElementById('avgTemp').textContent = `Avg: ${avg.toFixed(1)}°C`;        hour12: false,

}        hour: '2-digit',

        minute: '2-digit',

function updateStatus(text, connected) {        second: '2-digit'

    document.getElementById('statusText').textContent = text;    });

    const indicator = document.getElementById('statusIndicator');    document.getElementById('timestamp').textContent = formatted;

    if (connected) {}

        indicator.classList.add('connected');

    } else {function updateCurrentTime() {

        indicator.classList.remove('connected');    if (!state.isConnected) {

    }        const now = new Date().toLocaleTimeString('en-US', { 

}            hour12: false,

            hour: '2-digit',

function updateTimestamp(isoString) {            minute: '2-digit',

    const date = new Date(isoString);            second: '2-digit'

    const formatted = date.toLocaleTimeString('en-US', {         });

        hour12: false,        document.getElementById('timestamp').textContent = now;

        hour: '2-digit',    }

        minute: '2-digit',}

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
