import urllib.request
import json
import os
import datetime

# Manually copy keys from .env.local
SUPABASE_URL = "https://db.clickpar.shop"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3NjkyMzY3MDgsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlzcyI6InN1cGFiYXNlIn0.0aG6JHx4YAiUa4zrrVbOBcY5JuXvzWx-d7FPBIEGwHg"

def api_request(path, method="GET", payload=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    data = None
    if payload:
        data = json.dumps(payload).encode()
        
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status in [200, 201]:
                return json.loads(response.read().decode())
            return []
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} for {e.url}")
        print(e.read().decode())
        return None

def main():
    # 1. Fetch expenses updated today (the last hour)
    print("Fetching recent renewal expenses...")
    # Time window: After 2026-04-18T05:00:00Z
    expenses = api_request("expenses?expense_type=eq.renewal&created_at=gte.2026-04-18T05:00:00Z")
    
    if not expenses:
        print("No recent expenses found.")
        return
        
    print(f"Found {len(expenses)} recent renewal expenses.")
    
    for exp in expenses:
        if "+25 días" not in exp.get("description", ""):
            print(f"Skipping {exp.get('id')} - not a +25 days renewal.")
            continue
            
        m_id = exp.get("mother_account_id")
        desc = exp.get("description", "")
        
        # 2. Get mother account
        accounts = api_request(f"mother_accounts?id=eq.{m_id}")
        if not accounts:
            print(f"Could not find mother account {m_id}")
            continue
            
        account = accounts[0]
        curr_renewal = account.get("renewal_date")
        
        if not curr_renewal:
            print(f"Account {m_id} has no renewal date, skipping...")
            continue
            
        # Parse and subtract 25 days
        try:
            curr_date = datetime.datetime.strptime(curr_renewal, "%Y-%m-%d")
            new_date = curr_date - datetime.timedelta(days=25)
            new_renewal_str = new_date.strftime("%Y-%m-%d")
        except Exception as e:
            print(f"Error parsing date {curr_renewal}: {e}")
            continue
            
        # 3. Update mother account
        print(f"Reverting account {m_id} from {curr_renewal} back to {new_renewal_str}...")
        api_request(f"mother_accounts?id=eq.{m_id}", method="PATCH", payload={"renewal_date": new_renewal_str})
        
        # 4. Delete expense
        print(f"Deleting expense {exp.get('id')}...")
        api_request(f"expenses?id=eq.{exp.get('id')}", method="DELETE")
        
    print("Done catching up.")

if __name__ == "__main__":
    main()
