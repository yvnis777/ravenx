"""Production gunicorn config: gunicorn -c gunicorn.conf.py "app:create_app()"

ONE worker, always. The copy engine runs inside the worker process, so every
extra worker would be another engine copying each fill again. Concurrency for
HTTP requests comes from threads instead. app._try_engine_lock backs this up.
"""
import os

bind = os.environ.get("GUNICORN_BIND", "127.0.0.1:5000")
workers = 1
worker_class = "gthread"
threads = 8

# The engine's threads must start in the worker, not in a master that then forks.
preload_app = False
# Recycling the worker would restart the engine mid-flight for no benefit.
max_requests = 0

timeout = 60
graceful_timeout = 30
accesslog = "-"
errorlog = "-"


def on_starting(server):
    if server.cfg.workers != 1:
        raise RuntimeError(
            f"workers={server.cfg.workers}: RavenX must run exactly 1 gunicorn worker "
            "(each worker runs a copy engine — more would duplicate users' orders)"
        )
