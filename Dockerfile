FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY discoj ./discoj
RUN useradd --create-home app && mkdir /app/data && chown app:app /app/data
USER app
CMD ["python", "-m", "discoj.main"]
