import logging
import azure.functions as func
import json
import base64
import io
from typing import List

# ======================================================================
# 🚀 DECLARE MATRIX DIMENSIONS HERE 🚀
# These are used by the JAVASCRIPT on the website.
ROW_COUNT = 32
COL_COUNT = 64
MATRIX_SIZE = ROW_COUNT * COL_COUNT
# ======================================================================

# Define the function app
app = func.FunctionApp(http_auth_level=func.AuthLevel.ANONYMOUS)


# --- FUNCTION 1: REAL-TIME DATA PROCESSING ---
@app.event_hub_trigger(arg_name="events",
                       event_hub_name="iothub-ehub-bheemiothu-56634568-760d64e04b", # MODIFIED: Using your specific name
                       connection="IotHubEventHubConnectionString")
@app.blob_output(arg_name="outputBlob",
                 path="clean-data/latest-raw-data.json",
                 connection="AzureWebJobsStorage")
@app.signalr_output(arg_name="signalRMessages",
                    connection_string_setting="AzureSignalRConnectionString",
                    hub_name="heatmap")
def ProcessIotHubData(events: List[func.EventHubEvent],
                      outputBlob: func.Out[str],
                      signalRMessages: func.Out[str]):
    """
    FUNCTION 1: (Backend - REAL-TIME)
    Triggered by IoT Hub, NOT Blob Storage. This is fast.
    Processes the *last* message in the batch.
    Saves it to 'latest-raw-data.json'.
    Sends it via SignalR.
    """
    
    # We only care about the *latest* message in the batch
    # to avoid flooding the website and storage.
    if not events:
        return

    # Get the last event
    event = events[-1]
    
    try:
        # 1. Get the message body
        messageBody = event.get_body().decode('utf-8')
        
        # 2. Parse the JSON to find the Base64 string.
        #    We assume the ESP32 sends a message like: { "matrix_base64": "..." }
        json_message = json.loads(messageBody)
        base64_string = json_message.get("matrix_base64")

        if not base64_string:
            logging.warning("Message received, but 'matrix_base64' field was missing or empty.")
            return

        # 3. Get the official time the message arrived
        enqueued_time = event.enqueued_time.isoformat()

        # 4. Create the raw data object
        latest_valid_data = {
            "timestamp": enqueued_time,
            "base64": base64_string
        }
        
        output_json = json.dumps(latest_valid_data)

        # 5. Write to the output blob (for initial page loads)
        outputBlob.set(output_json)
        
        # 6. Send raw data via SignalR (for live updates)
        signalRMessages.set(json.dumps({
            'target': 'newRawData',
            'arguments': [latest_valid_data]
        }))

    except json.JSONDecodeError:
        logging.error(f"Error: Message is not valid JSON: {messageBody}")
    except Exception as e:
        logging.error(f"Error processing Event Hub message: {e}")


# --- FUNCTION 2: WEBSITE FRONTEND (HTML Page - UNCHANGED) ---
@app.route(route="heatmap")
def ShowHeatmap(req: func.HttpRequest) -> func.HttpResponse:
    """
    FUNCTION 2: (Frontend Website)
    Returns the main HTML page.
    This page connects to SignalR and calls /api/getdata on load.
    (This function is unchanged from the previous version)
    """
    logging.info('ShowHeatmap HTTP trigger function processed a request.')

    html_content = f"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Real-Time Sensor Heatmap</title>
        <style>
            body {{
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                display: grid;
                place-items: center;
                min-height: 90vh;
                background-color: #f4f7f6;
                color: #333;
            }}
            h1 {{
                font-weight: 300;
            }}
            p {{
                font-size: 0.9rem;
                color: #555;
                min-height: 1.2em; /* Reserve space for timestamp */
            }}
            table {{
                border-collapse: collapse;
                box-shadow: 0 4px 12px rgba(0,0,0,0.05);
                border-radius: 8px;
                overflow: hidden;
            }}
            th, td {{
                padding: 0.75rem;
                text-align: center;
                font-size: 0.8rem;
                font-weight: 500;
                width: 30px;
                height: 30px;
            }}
            thead th {{
                background-color: #e9ecef;
            }}
            tbody th {{
                background-color: #e9ecef;
            }}
            td {{
                color: white;
                text-shadow: 0 1px 1px rgba(0,0,0,0.2);
                font-weight: 700;
            }}
            .container {{
                text-align: center;
            }}
            #heatmap-container {{
                min-width: 600px;
                min-height: 500px;
            }}
            #status-light {{
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background-color: #ff4d4d; /* Red (disconnected) */
                display: inline-block;
                margin-right: 8px;
                transition: background-color 0.5s ease;
            }}
            #status-light.connected {{
                background-color: #4CAF50; /* Green (connected) */
            }}
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.0/signalr.min.js"></script>
    </head>
    <body>
        <div class="container">
            <h1>Sensor Matrix Heatmap ({ROW_COUNT}x{COL_COUNT})</h1>
            <p><span id="status-light" title="SignalR Connection Status"></span><span id="timestamp-display">Loading data...</span></p>
            <div id="heatmap-container">
            </div>
        </div>

        <script>
            // Python variables injected here
            const ROW_COUNT = {ROW_COUNT};
            const COL_COUNT = {COL_COUNT};
            const MATRIX_SIZE = {MATRIX_SIZE};
            // *************************************************

            let currentTimestamp = ''; // Store the timestamp of the data we are showing
            const statusLight = document.getElementById('status-light');
            const timestampDisplay = document.getElementById('timestamp-display');

            // Helper function to generate a color from blue (low) to red (high)
            function getColorForValue(value, min_val, max_val) {{
                let percent = 0.5;
                if (max_val !== min_val) {{
                    percent = (value - min_val) / (max_val - min_val);
                }}
                const hue = 240 - (percent * 240);
                return `background-color: hsl(${{hue}}, 100%, 50%);`;
            }}

            // Function to build the HTML table from the data
            function buildHeatmap(data) {{
                const {{ timestamp, matrix, min_val, max_val }} = data;
                
                if (!matrix || matrix.length !== ROW_COUNT || (ROW_COUNT > 0 && matrix[0].length !== COL_COUNT)) {{
                    timestampDisplay.innerText = 'Data size mismatch! Expected {ROW_COUNT}x{COL_COUNT}.';
                    console.error('Data size mismatch in JSON payload');
                    return;
                }}

                timestampDisplay.innerText = `Displaying latest processed data from: ${{timestamp}}`;
                let html_table = "<table>";
                html_table += "<thead><tr><th></th>";
                for (let col = 0; col < COL_COUNT; col++) {{
                    html_table += `<th>${{col}}</th>`;
                }}
                html_table += "</tr></thead><tbody>";

                for (let r = 0; r < ROW_COUNT; r++) {{
                    html_table += `<tr><th>${{r}}</th>`; // Row header
                    for (let c = 0; c < COL_COUNT; c++) {{
                        const value = matrix[r][c];
                        const color_style = getColorForValue(value, min_val, max_val);
                        html_table += `<td style='${{color_style}}' title='(${{r}},${{c}}): ${{value}}'>${{value}}</td>`;
                    }}
                    html_table += "</tr>";
                }}
                html_table += "</tbody></table>";
                document.getElementById('heatmap-container').innerHTML = html_table;
            }}
            
            // Function to decode and render
            function processAndBuildHeatmap(data) {{
                const {{ timestamp, base64 }} = data;

                if (timestamp === currentTimestamp) {{
                    return; // Already displaying this data
                }}
                currentTimestamp = timestamp;

                try {{
                    // 1. Decode Base64 string (atob)
                    const decodedString = atob(base64);
                    
                    // 2. Convert byte string to Uint8Array
                    const matrix_1d = new Uint8Array(decodedString.length);
                    for (let i = 0; i < decodedString.length; i++) {{
                        matrix_1d[i] = decodedString.charCodeAt(i);
                    }}

                    if (matrix_1d.length !== MATRIX_SIZE) {{
                        timestampDisplay.innerText = `Error: Decoded data size is ${{matrix_1d.length}}, expected ${{MATRIX_SIZE}}`;
                        return;
                    }}

                    // 3. Reshape 1D array into 2D matrix
                    const matrix = [];
                    let min_val = 255;
                    let max_val = 0;

                    for (let r = 0; r < ROW_COUNT; r++) {{
                        const row = [];
                        for (let c = 0; c < COL_COUNT; c++) {{
                            const value = matrix_1d[r * COL_COUNT + c];
                            row.push(value);
                            if (value < min_val) min_val = value;
                            if (value > max_val) max_val = value;
                        }}
                        matrix.push(row);
                    }}

                    // 4. Build the heatmap
                    buildHeatmap({{ timestamp, matrix, min_val, max_val }});

                }} catch (e) {{
                    console.error("Error decoding or processing heatmap data:", e);
                    timestampDisplay.innerText = "Error decoding data.";
                }}
            }}

            // Function to fetch the data from our new API endpoint
            async function fetchData() {{
                try {{
                    const response = await fetch('/api/getdata');
                    if (!response.ok) {{
                        timestampDisplay.innerText = 'Error loading data. No data file found?';
                        return;
                    }}
                    
                    const data = await response.json();
                    
                    processAndBuildHeatmap(data);

                }} catch (error) {{
                    console.error('Error fetching data:', error);
                    timestampDisplay.innerText = 'Error connecting to data API.';
                }}
            }}

            // SignalR Connection Logic
            const connection = new signalR.HubConnectionBuilder()
                .withUrl("/api")
                .withAutomaticReconnect()
                .build();

            connection.onreconnecting(error => {{
                console.warn("SignalR connection lost. Attempting to reconnect...");
                statusLight.classList.remove("connected");
                statusLight.title = "Reconnecting...";
            }});

            connection.onreconnected(connectionId => {{
                console.log("SignalR reconnected successfully!");
                statusLight.classList.add("connected");
                statusLight.title = "Connected";
            }});

            connection.onclose(error => {{
                console.error("SignalR connection closed.");
                statusLight.classList.remove("connected");
                statusLight.title = "Disconnected";
            }});

            // Listen for 'newRawData'
            connection.on("newRawData", (data) => {{
                console.log("Received SignalR 'newRawData' message");
                timestampDisplay.innerText = "New data available! Processing...";
                processAndBuildHeatmap(data);
            }});

            // Start the connection
            async function startSignalR() {{
                try {{
                    await connection.start();
                    console.log("SignalR Connected!");
                    statusLight.classList.add("connected");
                    statusLight.title = "Connected";
                }} catch (err) {{
                    console.error("SignalR Connection Failed: ", err);
                    setTimeout(startSignalR, 5000); // Retry after 5 seconds
                }}
            }}

            // Fetch data when the page first loads
            document.addEventListener('DOMContentLoaded', () => {{
                fetchData();    // Load initial data
                startSignalR(); // Start the SignalR connection
            }});

        </script>
    </body>
    </html>
    """
    return func.HttpResponse(
        body=html_content,
        status_code=200,
        mimetype="text/html"
    )


# --- FUNCTION 3: WEBSITE BACKEND (DATA API - UNCHANGED) ---
@app.route(route="getdata")
@app.blob_input(arg_name="latestDataBlob", 
                path="clean-data/latest-raw-data.json", # Reads the file created by Function 1
                connection="AzureWebJobsStorage")
def GetHeatmapData(req: func.HttpRequest, latestDataBlob: func.InputStream) -> func.HttpResponse:
    """
    FUNCTION 3: (Data API)
    Triggered by an HTTP request to /api/getdata.
    Reads 'latest-raw-data.json' and returns its content.
    (This function is unchanged from the previous version)
    """
    logging.info('GetHeatmapData HTTP trigger function processed a request.')

    if latestDataBlob is None:
        return func.HttpResponse(
            json.dumps({ "error": "No processed data file found." }),
            status_code=404,
            mimetype="application/json"
        )

    try:
        # Read the JSON data from the blob
        data_content = latestDataBlob.read().decode('utf-8')
        
        # Just return the raw JSON content.
        return func.HttpResponse(
            body=data_content,
            status_code=200,
            mimetype="application/json"
        )

    except Exception as e:
        logging.error(f"Error in GetHeatmapData: {e}")
        return func.HttpResponse(json.dumps({ "error": str(e) }), status_code=500, mimetype="application/json")