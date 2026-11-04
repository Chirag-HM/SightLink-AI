import asyncio
import unittest
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from volunteer_assistance.backend.database import Base
from volunteer_assistance.backend.models import User, UserRole, AssistanceRequest, RequestStatus
from volunteer_assistance.backend.atomic_claim import atomic_claim_request

# In-memory SQLite for testing
TEST_DB_URL = "sqlite:///:memory:"
test_engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

class TestAtomicClaim(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        Base.metadata.create_all(bind=test_engine)
        self.db = TestSession()

        # Create blind user
        self.blind_user = User(
            id=str(uuid.uuid4()),
            username="blind_tester",
            hashed_password="hash",
            full_name="Blind User",
            role=UserRole.BLIND_USER
        )
        # Create two competing volunteers
        self.vol1 = User(
            id=str(uuid.uuid4()),
            username="vol1",
            hashed_password="hash",
            full_name="Volunteer 1",
            role=UserRole.VOLUNTEER
        )
        self.vol2 = User(
            id=str(uuid.uuid4()),
            username="vol2",
            hashed_password="hash",
            full_name="Volunteer 2",
            role=UserRole.VOLUNTEER
        )
        self.db.add_all([self.blind_user, self.vol1, self.vol2])
        self.db.commit()

        # Create a pending assistance request
        self.req = AssistanceRequest(
            id=str(uuid.uuid4()),
            blind_user_id=self.blind_user.id,
            status=RequestStatus.PENDING,
            latitude=12.9716,
            longitude=77.5946,
            assistance_type="Road Crossing"
        )
        self.db.add(self.req)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=test_engine)

    async def test_concurrent_claim_only_one_succeeds(self):
        """Simulate two volunteers clicking Accept simultaneously."""
        results = []

        async def try_accept(volunteer):
            db_session = TestSession()
            try:
                res = await atomic_claim_request(db_session, self.req.id, volunteer)
                results.append(("SUCCESS", volunteer.username, res.accepted_by_id))
            except HTTPException as e:
                results.append(("FAILED", volunteer.username, e.status_code))
            finally:
                db_session.close()

        # Launch simultaneously via asyncio.gather
        await asyncio.gather(
            try_accept(self.vol1),
            try_accept(self.vol2)
        )

        successes = [r for r in results if r[0] == "SUCCESS"]
        failures = [r for r in results if r[0] == "FAILED"]

        self.assertEqual(len(successes), 1, "Exactly one volunteer must claim the request")
        self.assertEqual(len(failures), 1, "The competing volunteer must be rejected")
        self.assertEqual(failures[0][2], 409, "Rejected claim must return HTTP 409 Conflict")

if __name__ == '__main__':
    unittest.main()
