#!/usr/bin/env python3
"""
Script to examine and display the captured tool schemas.
"""

import json
from pathlib import Path

def examine_schema_file(filepath):
    """Examine and display a schema file."""
    print(f"\n{'='*60}")
    print(f"Schema File: {filepath.name}")
    print(f"{'='*60}")
    
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
        
        print(f"Tool Name: {data.get('tool_name', 'Unknown')}")
        print(f"Test Scenario: {data.get('test_scenario', 'Unknown')}")
        print(f"Success: {data.get('success', False)}")
        
        if data.get('stderr'):
            print(f"Stderr: {data['stderr']}")
        
        print(f"\nNumber of messages: {len(data.get('messages', []))}")
        
        for i, message in enumerate(data.get('messages', [])):
            print(f"\nMessage {i+1}:")
            print(f"  Type: {message.get('type', 'unknown')}")
            if 'subtype' in message:
                print(f"  Subtype: {message['subtype']}")
            
            # Show relevant fields based on message type
            if message.get('type') == 'system' and message.get('subtype') == 'init':
                print(f"  Tools: {message.get('tools', [])}")
                print(f"  Model: {message.get('model', 'unknown')}")
                print(f"  Permission Mode: {message.get('permissionMode', 'unknown')}")
            elif message.get('type') == 'assistant':
                if 'message' in message:
                    content = message['message'].get('content', [])
                    if content:
                        print(f"  Content preview: {str(content)[:200]}...")
            elif message.get('type') == 'result':
                print(f"  Is Error: {message.get('is_error', True)}")
                print(f"  Num Turns: {message.get('num_turns', 0)}")
                print(f"  Duration MS: {message.get('duration_ms', 0)}")
                if 'result' in message:
                    print(f"  Result preview: {message['result'][:200]}...")
        
    except Exception as e:
        print(f"Error reading {filepath}: {e}")

def main():
    """Main function to examine all schema files."""
    schemas_dir = Path("schemas")
    
    if not schemas_dir.exists():
        print("Schemas directory not found!")
        return
    
    schema_files = list(schemas_dir.glob("*_schema.json"))
    
    if not schema_files:
        print("No schema files found!")
        return
    
    print(f"Found {len(schema_files)} schema files:")
    for schema_file in sorted(schema_files):
        examine_schema_file(schema_file)

if __name__ == "__main__":
    main()