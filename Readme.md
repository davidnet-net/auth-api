<h3 align="center">AUTH API.</h3>

> [!IMPORTANT]
> When working on the API and especially when formatting.
> Set the terminal to be in /api else the deno config gets ignored.


### Example .env
```
ISPROD=true
JWT_SECRET="64characterslongstringplz"
MYSQL_ROOT_PASSWORD="example"
MYSQL_USER="example"
MYSQL_PASSWORD="example"
MYSQL_DATABASE="example"
LOG_DIR="logs"
KEEP_LOG_DAYS=7
LOG_TO_TERMINAL=true
EMAIL="example@example.com
EMAIL_PASSWORD="example"
INTERNAL_TOKEN="64characterslongstringplz"
RABBITMQ_USER=""
RABBITMQ_PASS=""
```

To test run ```docker compose down -v && docker build api && docker compose up --build```