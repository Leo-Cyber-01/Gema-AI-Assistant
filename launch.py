"""
Miya AI Companion - Unified Launcher
Starts both backend API and Next.js frontend automatically
"""
import subprocess
import sys
import time
import os
import webbrowser
from pathlib import Path

def main():
    print("╔════════════════════════════════════════╗")
    print("║     Miya AI Companion - Web UI         ║")
    print("╚════════════════════════════════════════╝")
    print()
    
    # Check if config is set up
    config_path = Path("character_config.yaml")
    if config_path.exists():
        with open(config_path, 'r') as f:
            content = f.read()
            if 'sk-or-v1-YOURAPIKEY' in content or 'YOURAPIKEY' in content:
                print("⚠️  WARNING: Please set your OpenRouter API key in character_config.yaml")
                print("   Get your key from: https://openrouter.ai/keys")
                print()
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    client_dir = os.path.join(base_dir, 'client')
    has_node_modules = os.path.exists(os.path.join(client_dir, 'node_modules'))
    
    print("Starting Miya Web Interface...")
    print()
    
    processes = []
    
    try:
        # 1. Start Gemini Live Relay
        print("1. Starting Gemini Live Relay on ws://localhost:8765...")
        relay_process = subprocess.Popen(
            [sys.executable, "server/server.py"],
            cwd=base_dir
        )
        processes.append(relay_process)
        time.sleep(2)

        # 2. Start Backend API
        print("2. Starting Backend API on http://localhost:8001...")
        backend_process = subprocess.Popen(
            [sys.executable, "server/main.py"],
            cwd=base_dir
        )
        processes.append(backend_process)
        time.sleep(2)
        
        # 3. Start Frontend if dependencies exist
        if has_node_modules:
            print("3. Starting Vite Frontend on http://localhost:5173...")
            frontend_process = subprocess.Popen(
                ["npm", "run", "dev"],
                cwd=client_dir,
                shell=True
            )
            processes.append(frontend_process)
            time.sleep(5)
            
            print("\n🌐 Opening browser at http://localhost:5173...")
            webbrowser.open("http://localhost:5173")
            print("\n✅ Miya is ready!")
            print("   Frontend: http://localhost:5173")
            print("   API: http://localhost:8001")
            print("   Relay: ws://localhost:8765")
        else:
            print("\n⚠️  Frontend dependencies not installed.")
            print("   Run: cd client && npm install")
            print("\n   For now, using basic API at http://localhost:8001")
            print("\n🌐 Opening browser...")
            webbrowser.open("http://localhost:8001")
        
        print("\nPress Ctrl+C to stop")
        print()
        
        # Keep running
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\n\n🛑 Shutting down Miya...")
        for p in processes:
            p.terminate()
        print("👋 Goodbye, senpai!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        for p in processes:
            p.terminate()
        sys.exit(1)

if __name__ == "__main__":
    main()
