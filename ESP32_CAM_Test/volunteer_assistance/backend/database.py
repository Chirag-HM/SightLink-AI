from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30} if settings.DATABASE_URL.startswith("sqlite") else {}
)

if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _configure_sqlite(dbapi_connection, _connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def run_migrations():
    """Safely add newly introduced columns onto existing SQLite tables without data loss."""
    Base.metadata.create_all(bind=engine)
    if not settings.DATABASE_URL.startswith("sqlite"):
        return

    column_migrations = {
        "users": [
            ("email_verified", "BOOLEAN NOT NULL DEFAULT 0"),
            ("auth_provider", "VARCHAR(24) NOT NULL DEFAULT 'local'"),
            ("google_sub", "VARCHAR(128)"),
            ("photo_url", "TEXT"),
            ("needs_role_selection", "BOOLEAN NOT NULL DEFAULT 0"),
            ("is_verified", "BOOLEAN NOT NULL DEFAULT 0"),
            ("phone_verified", "BOOLEAN NOT NULL DEFAULT 0"),
            ("verification_method", "VARCHAR(32)"),
            ("verification_reference", "VARCHAR(64)"),
            ("is_suspended", "BOOLEAN NOT NULL DEFAULT 0"),
        ],
        "volunteer_profiles": [
            ("is_verified", "BOOLEAN NOT NULL DEFAULT 0"),
            ("avg_rating", "FLOAT NOT NULL DEFAULT 5.0"),
            ("rating_count", "INTEGER NOT NULL DEFAULT 0"),
            ("completed_count", "INTEGER NOT NULL DEFAULT 0"),
        ],
        "assistance_requests": [
            ("escalation_stage", "INTEGER NOT NULL DEFAULT 0"),
            ("last_escalated_at", "DATETIME"),
            ("no_volunteer_alerted_at", "DATETIME"),
            ("rating", "INTEGER"),
            ("rating_comment", "TEXT"),
            ("arrived_at", "DATETIME"),
        ],
        "family_share_sessions": [
            ("encrypted_last_coords", "TEXT"),
            ("last_place_name", "VARCHAR(128)"),
            ("paused_until", "DATETIME"),
            ("quiet_hours_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
            ("quiet_hours_start", "VARCHAR(8) DEFAULT '22:00'"),
            ("quiet_hours_end", "VARCHAR(8) DEFAULT '07:00'"),
            ("quiet_hours_tz_offset_min", "INTEGER NOT NULL DEFAULT 0"),
            ("caregiver_managed", "BOOLEAN NOT NULL DEFAULT 0"),
            ("caregiver_name", "VARCHAR(128)"),
            ("raw_retention_days", "INTEGER NOT NULL DEFAULT 7"),
            ("stopped_anchor_enc", "TEXT"),
            ("stopped_anchor_since", "DATETIME"),
            ("long_stop_alerted", "BOOLEAN NOT NULL DEFAULT 0"),
        ],
        "family_links": [
            ("status", "VARCHAR(32) NOT NULL DEFAULT 'approved'"),
            ("share_arrival_departure", "BOOLEAN NOT NULL DEFAULT 1"),
            ("share_help_requests", "BOOLEAN NOT NULL DEFAULT 1"),
            ("share_unusual_route", "BOOLEAN NOT NULL DEFAULT 1"),
            ("share_live_map", "BOOLEAN NOT NULL DEFAULT 1"),
            ("confirmed_at", "DATETIME"),
            ("notify_email", "BOOLEAN NOT NULL DEFAULT 1"),
            ("notify_telegram", "BOOLEAN NOT NULL DEFAULT 1"),
            ("notify_web_push", "BOOLEAN NOT NULL DEFAULT 1"),
            ("receive_sos", "BOOLEAN NOT NULL DEFAULT 1"),
            ("receive_no_volunteer", "BOOLEAN NOT NULL DEFAULT 1"),
            ("receive_volunteer_accepted", "BOOLEAN NOT NULL DEFAULT 1"),
            ("receive_help_completed", "BOOLEAN NOT NULL DEFAULT 1"),
            ("receive_place_arrival", "BOOLEAN NOT NULL DEFAULT 1"),
        ],
        "location_breadcrumbs": [
            ("encrypted_coords", "TEXT"),
        ],
    }

    with engine.begin() as conn:
        added_email_verified = False
        for table, cols in column_migrations.items():
            existing = {
                row[1]
                for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
            }
            for col_name, col_def in cols:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
                    if table == "users" and col_name == "email_verified":
                        added_email_verified = True
        if added_email_verified:
            # Preserve pre-existing legacy no-email accounts without blocking older local fixtures
            conn.execute(text("UPDATE users SET email_verified = 1 WHERE email IS NULL"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_sub ON users(google_sub)"))

        # Ensure email_verification_codes allows pending_id (nullable user_id) before verification
        otp_cols = conn.execute(text("PRAGMA table_info(email_verification_codes)")).fetchall()
        otp_col_map = {row[1]: row for row in otp_cols}
        needs_otp_rebuild = (
            bool(otp_cols)
            and (
                "pending_id" not in otp_col_map
                or (otp_col_map.get("user_id") and otp_col_map["user_id"][3] == 1)
            )
        )
        if needs_otp_rebuild:
            conn.execute(text("ALTER TABLE email_verification_codes RENAME TO _email_verification_codes_old"))
            conn.execute(
                text(
                    """
                    CREATE TABLE email_verification_codes (
                        id VARCHAR(36) PRIMARY KEY,
                        user_id VARCHAR(36) REFERENCES users(id) ON DELETE CASCADE,
                        pending_id VARCHAR(36) REFERENCES pending_registrations(id) ON DELETE CASCADE,
                        email VARCHAR(128) NOT NULL,
                        code_salt VARCHAR(64) NOT NULL,
                        code_hash VARCHAR(128) NOT NULL,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        max_attempts INTEGER NOT NULL DEFAULT 5,
                        locked BOOLEAN NOT NULL DEFAULT 0,
                        consumed BOOLEAN NOT NULL DEFAULT 0,
                        invalidated BOOLEAN NOT NULL DEFAULT 0,
                        expires_at DATETIME NOT NULL,
                        created_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO email_verification_codes (
                        id, user_id, email, code_salt, code_hash, attempts, max_attempts,
                        locked, consumed, invalidated, expires_at, created_at
                    )
                    SELECT id, user_id, email, code_salt, code_hash, attempts, max_attempts,
                           locked, consumed, invalidated, expires_at, created_at
                    FROM _email_verification_codes_old
                    """
                )
            )
            conn.execute(text("DROP TABLE _email_verification_codes_old"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_email_verification_codes_user_id ON email_verification_codes(user_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_email_verification_codes_pending_id ON email_verification_codes(pending_id)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_email_verification_codes_email ON email_verification_codes(email)"))

        # Release any abandoned pre-fix unverified local signups so username & email register only after verification
        stale_unverified = conn.execute(
            text(
                """
                SELECT id FROM users
                WHERE email IS NOT NULL AND email_verified = 0 AND auth_provider = 'local'
                """
            )
        ).fetchall()
        for (stale_uid,) in stale_unverified:
            conn.execute(text("DELETE FROM family_share_sessions WHERE blind_user_id = :uid"), {"uid": stale_uid})
            conn.execute(text("DELETE FROM volunteer_profiles WHERE user_id = :uid"), {"uid": stale_uid})
            conn.execute(text("DELETE FROM email_verification_codes WHERE user_id = :uid"), {"uid": stale_uid})
            conn.execute(text("DELETE FROM family_links WHERE family_user_id = :uid OR blind_user_id = :uid"), {"uid": stale_uid})
            conn.execute(text("DELETE FROM users WHERE id = :uid"), {"uid": stale_uid})
