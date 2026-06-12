import asyncio
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

from app.core.config import settings
from app.db.base import Base
from app.db.models import *  # noqa

target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", settings.db_url)


def run_migrations_offline() -> None:
    import sys
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()
    sys.exit(0)


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    from urllib.parse import urlparse
    db_url = config.get_main_option("sqlalchemy.url")
    parsed = urlparse(db_url)
    print(f"Connecting to database at {parsed.hostname}:{parsed.port}/{parsed.path.lstrip('/')} with user {parsed.username} using driver {parsed.scheme}", flush=True)

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={
            "timeout": 10,
            "server_settings": {
                "statement_timeout": "10000",
                "lock_timeout": "10000",
            },
        },
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    import sys
    asyncio.run(run_async_migrations())
    sys.exit(0)


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
