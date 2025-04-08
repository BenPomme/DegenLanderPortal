import requests
import json
import time
import os

API_KEY = "KGONF7JN3HYIGUWO"  # Consider using environment variables in production
MAX_STOCKS_TO_PROCESS = 3  # Alpha Vantage has rate limits (5 API calls per minute on free tier)

stocks = [
    {"ticker": "AAPL", "name": "Apple Inc."},
    {"ticker": "MSFT", "name": "Microsoft Corporation"},
    {"ticker": "GOOGL", "name": "Alphabet Inc."},
    {"ticker": "AMZN", "name": "Amazon.com Inc."},
    {"ticker": "TSLA", "name": "Tesla Inc."},
    {"ticker": "META", "name": "Meta Platforms Inc."},
    {"ticker": "NVDA", "name": "NVIDIA Corporation"},
    {"ticker": "NFLX", "name": "Netflix Inc."},
    {"ticker": "BABA", "name": "Alibaba Group"},
    {"ticker": "JPM", "name": "JPMorgan Chase"},
    {"ticker": "BAC", "name": "Bank of America"},
    {"ticker": "V", "name": "Visa Inc."},
    {"ticker": "MA", "name": "Mastercard Inc."},
    {"ticker": "WMT", "name": "Walmart Inc."},
    {"ticker": "DIS", "name": "Walt Disney"},
    {"ticker": "PFE", "name": "Pfizer Inc."},
    {"ticker": "KO", "name": "Coca-Cola Co."},
    {"ticker": "MCD", "name": "McDonald's Corp"},
    {"ticker": "BA", "name": "Boeing Co."},
    {"ticker": "UNH", "name": "UnitedHealth Group"}
]

main_stock_list = []

def compute_terrain(stock_data, canvas_width=800, canvas_height=600):
    # Extract closing prices
    prices = [float(item["4. close"]) for item in stock_data if "4. close" in item]
    if not prices:
        return None
    display_count = len(prices)
    min_price = min(prices)
    max_price = max(prices)
    price_range = max_price - min_price
    step = canvas_width / (display_count - 1)
    points = []
    for i, price in enumerate(prices):
        x = i * step
        normalized = (price - min_price) / (price_range or 1)
        y = canvas_height - normalized * (canvas_height * 0.5)
        points.append({"x": x, "y": y, "price": price})
    terrain = {
        "points": points,
        "minP": min_price,
        "maxP": max_price,
        "dates": [f"Day {i+1}" for i in range(display_count)],
        "closePrice": prices[-1]
    }
    return terrain

# Process a limited number of stocks to avoid rate limits
for stock in stocks[:MAX_STOCKS_TO_PROCESS]:
    ticker = stock["ticker"]
    url = f"https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={ticker}&apikey={API_KEY}"
    print(f"Fetching data for {ticker}")
    try:
        response = requests.get(url)
        data = response.json()
    except Exception as e:
        print(f"Error fetching data for {ticker}: {e}")
        continue

    if "Time Series (Daily)" not in data:
        print(f"Error: No time series data for {ticker}. Response: {data}")
        continue

    time_series = data["Time Series (Daily)"]
    dates = sorted(time_series.keys())
    if not dates:
        print(f"No dates found for {ticker}.")
        continue
    latest_date = dates[-1]
    try:
        last_close = float(time_series[latest_date]["4. close"])
    except Exception as e:
        print(f"Error parsing closing price for {ticker}: {e}")
        continue

    main_stock_list.append({
        "ticker": ticker,
        "name": stock["name"],
        "price": last_close
    })

    # For terrain data: use the last 30 days (or all available if fewer)
    last_30_dates = dates[-30:]
    terrain_raw = []
    for d in last_30_dates:
        try:
            close_value = time_series[d]["4. close"]
            terrain_raw.append({"4. close": close_value})
        except Exception as e:
            print(f"Error parsing data for date {d} of {ticker}: {e}")

    terrain = compute_terrain(terrain_raw)
    if terrain is None:
        print(f"Could not compute terrain for {ticker} (no valid prices)")
    else:
        stock_filename = f"stock_{ticker}.json"
        try:
            with open(stock_filename, "w") as f:
                json.dump(terrain, f, indent=4)
            print(f"Saved terrain data for {ticker} to {stock_filename}")
        except Exception as e:
            print(f"Error writing file {stock_filename}: {e}")

    # Sleep to respect API rate limits (Alpha Vantage allows 5 calls per minute)
    time.sleep(12)

try:
    with open("stocks.json", "w") as f:
        json.dump(main_stock_list, f, indent=4)
    print("Saved main stock list to stocks.json")
except Exception as e:
    print(f"Error writing stocks.json: {e}")