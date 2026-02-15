FROM python:3.12-slim

WORKDIR /app

# Install system deps for bittensor (rust/cargo for substrate)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc g++ curl && \
    rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]" 2>/dev/null || pip install --no-cache-dir .

COPY . .
RUN pip install --no-cache-dir -e .

EXPOSE 8421

CMD ["djinn-validator"]
