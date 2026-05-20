# Custom REST API Federated Server

This is a simple Node.js / Express backend server that implements weights storage for the Snake AI's federated learning capability. It persists Q-table weights to a local `qtable.json` file inside this directory, allowing multiple browser tabs or computers on the same network to share training weights.

## 🚀 Setup and Run

1. Open your terminal inside the `server/` directory:
   ```bash
   cd server
   ```

2. Install the lightweight dependencies (`express`, `cors`):
   ```bash
   npm install
   ```

3. Launch the server:
   ```bash
   npm start
   ```

4. The server will start on port `3000`. The synchronization endpoint will be:
   ```
   http://localhost:3000/qtable
   ```

## ⚙️ How to Connect in Snake AI

1. Open the Snake AI website in your browser.
2. In the **Federated Sync Hub** panel, select **Custom REST API** as the Sync Provider.
3. In the **Database Endpoint URL** field, enter:
   ```
   http://localhost:3000/qtable
   ```
4. Click **Sync Model Now** or enable **Auto-Sync**. All sessions will now sync their learning through this local server!
