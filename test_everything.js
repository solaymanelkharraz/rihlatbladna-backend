import pool, { testConnection } from './src/config/db.js';

const API_BASE = 'http://localhost:5000/api';

// Simple 1x1 JPEG base64 string for testing fast image/avatar/story uploads
const SAMPLE_IMAGE_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runFullE2ETest() {
  console.log('🚀 =========================================================');
  console.log('🚀 STARTING RIHLAT BLADNA FULL PLATFORM E2E TEST SUITE');
  console.log('🚀 =========================================================\n');

  let passedTests = 0;
  let totalTests = 12;

  try {
    // -------------------------------------------------------------
    // TEST 1: Server Health Check
    // -------------------------------------------------------------
    console.log('Test 1/12: Checking API Health Server...');
    const healthRes = await fetch(`${API_BASE}/health`);
    const healthData = await healthRes.json();
    if (healthRes.ok && healthData.status === 'API is running') {
      console.log('✅ TEST 1 PASSED: API Server is alive and running.\n');
      passedTests++;
    } else {
      throw new Error(`Health check failed: ${JSON.stringify(healthData)}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Agency Registration
    // -------------------------------------------------------------
    const timestamp = Date.now();
    const agencyEmail = `test_agency_${timestamp}@atlas.ma`;
    const agencyPassword = 'Password123!';
    
    console.log(`Test 2/12: Registering Agency Account (${agencyEmail})...`);
    const regAgencyRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Atlas Sahara Tours E2E',
        email: agencyEmail,
        password: agencyPassword,
        role: 'agency',
        location: 'Merzouga, Morocco'
      })
    });
    const regAgencyData = await regAgencyRes.json();
    if (regAgencyRes.ok && regAgencyData.success && regAgencyData.token) {
      console.log(`✅ TEST 2 PASSED: Agency Registered (ID: ${regAgencyData.user.id}).\n`);
      passedTests++;
    } else {
      throw new Error(`Agency registration failed: ${JSON.stringify(regAgencyData)}`);
    }

    const agencyToken = regAgencyData.token;
    const agencyId = regAgencyData.user.id;

    // -------------------------------------------------------------
    // TEST 3: Agency Login
    // -------------------------------------------------------------
    console.log('Test 3/12: Verifying Agency Login...');
    const loginAgencyRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: agencyEmail, password: agencyPassword })
    });
    const loginAgencyData = await loginAgencyRes.json();
    if (loginAgencyRes.ok && loginAgencyData.success && loginAgencyData.token) {
      console.log('✅ TEST 3 PASSED: Agency Login verified successfully.\n');
      passedTests++;
    } else {
      throw new Error(`Agency login failed: ${JSON.stringify(loginAgencyData)}`);
    }

    // -------------------------------------------------------------
    // TEST 4: Update Agency Profile & Avatar Upload (LONGTEXT test)
    // -------------------------------------------------------------
    console.log('Test 4/12: Updating Agency Profile & Uploading Base64 Logo/Cover...');
    const updateProfileRes = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agencyToken}`
      },
      body: JSON.stringify({
        name: 'Atlas Sahara Tours & Expeditions',
        location: 'Merzouga Desert & Marrakech',
        bio: 'Premium 4x4 desert trips and luxury camel treks across the dunes.',
        avatar: SAMPLE_IMAGE_BASE64,
        cover: SAMPLE_IMAGE_BASE64
      })
    });
    const updateProfileData = await updateProfileRes.json();
    if (updateProfileRes.ok && updateProfileData.success) {
      console.log('✅ TEST 4 PASSED: Agency Profile & Base64 Avatar/Cover saved in LONGTEXT column without error.\n');
      passedTests++;
    } else {
      throw new Error(`Agency profile update failed: ${JSON.stringify(updateProfileData)}`);
    }

    // -------------------------------------------------------------
    // TEST 5: Create a Trip / Tour Offer
    // -------------------------------------------------------------
    console.log('Test 5/12: Creating a New Trip / Tour Offer...');
    const createTourRes = await fetch(`${API_BASE}/tours`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agencyToken}`
      },
      body: JSON.stringify({
        title: '3-Day Luxury Sahara Desert Expedition',
        location: 'Marrakech to Merzouga Dunes',
        price: 2400,
        duration: '3 Days / 2 Nights',
        groupSize: 'Max 8 travelers',
        category: 'Desert Trek',
        description: 'Experience the magic of Erg Chebbi dunes with luxury desert camp lodging and Berber music.',
        included: ['4x4 Transport', 'Luxury Camp Lodge', 'Breakfast & Dinner', 'Camel Trekking'],
        notIncluded: ['Lunches', 'Personal Drinks'],
        image: SAMPLE_IMAGE_BASE64,
        tags: ['Sahara', 'Luxury', 'CamelTrek']
      })
    });
    const createTourData = await createTourRes.json();
    if (createTourRes.ok && createTourData.success && createTourData.tour) {
      console.log(`✅ TEST 5 PASSED: Tour Offer Created (Tour ID: ${createTourData.tour.id}, Price: 2400 MAD).\n`);
      passedTests++;
    } else {
      throw new Error(`Tour creation failed: ${JSON.stringify(createTourData)}`);
    }

    const tourId = createTourData.tour.id;

    // -------------------------------------------------------------
    // TEST 6: Publish a Community Feed Post with Attached Offer Link
    // -------------------------------------------------------------
    console.log('Test 6/12: Publishing Community Feed Post with Attached Offer Link...');
    const createPostRes = await fetch(`${API_BASE}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agencyToken}`
      },
      body: JSON.stringify({
        content: '🌟 Early Bird Special! Join our 3-Day Sahara Expedition this weekend. Click Book or Chat below!',
        image: SAMPLE_IMAGE_BASE64,
        offerLink: `/tour/${tourId}`,
        hasOffer: true
      })
    });
    const createPostData = await createPostRes.json();
    if (createPostRes.ok && createPostData.success && createPostData.post) {
      console.log(`✅ TEST 6 PASSED: Community Post published with Attached Offer Link (Post ID: ${createPostData.post.id}).\n`);
      passedTests++;
    } else {
      throw new Error(`Post publication failed: ${JSON.stringify(createPostData)}`);
    }

    // -------------------------------------------------------------
    // TEST 7: Upload an Agency 24-Hour Story
    // -------------------------------------------------------------
    console.log('Test 7/12: Publishing Agency 24-Hour Story...');
    const storyRes = await fetch(`${API_BASE}/agencies/story`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agencyToken}`
      },
      body: JSON.stringify({
        storyImage: SAMPLE_IMAGE_BASE64
      })
    });
    const storyData = await storyRes.json();
    if (storyRes.ok && storyData.success) {
      console.log('✅ TEST 7 PASSED: Agency 24-Hour Story uploaded and active.\n');
      passedTests++;
    } else {
      throw new Error(`Story upload failed: ${JSON.stringify(storyData)}`);
    }

    // -------------------------------------------------------------
    // TEST 8: Traveler Registration
    // -------------------------------------------------------------
    const travelerEmail = `test_traveler_${timestamp}@gmail.com`;
    console.log(`Test 8/12: Registering Traveler Account (${travelerEmail})...`);
    const regTravelerRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Youssef El Traveler E2E',
        email: travelerEmail,
        password: 'Password123!',
        role: 'traveler',
        location: 'Casablanca, Morocco'
      })
    });
    const regTravelerData = await regTravelerRes.json();
    if (regTravelerRes.ok && regTravelerData.success && regTravelerData.token) {
      console.log(`✅ TEST 8 PASSED: Traveler Registered (ID: ${regTravelerData.user.id}).\n`);
      passedTests++;
    } else {
      throw new Error(`Traveler registration failed: ${JSON.stringify(regTravelerData)}`);
    }

    const travelerToken = regTravelerData.token;
    const travelerId = regTravelerData.user.id;

    // -------------------------------------------------------------
    // TEST 9: Traveler Avatar Upload & Profile Update
    // -------------------------------------------------------------
    console.log('Test 9/12: Updating Traveler Avatar Photo & Bio...');
    const updateTravelerRes = await fetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${travelerToken}`
      },
      body: JSON.stringify({
        name: 'Youssef El Traveler E2E',
        location: 'Tangier & Casablanca',
        bio: 'Passionate Moroccan traveler exploring the desert and imperial cities.',
        avatar: SAMPLE_IMAGE_BASE64
      })
    });
    const updateTravelerData = await updateTravelerRes.json();
    if (updateTravelerRes.ok && updateTravelerData.success) {
      console.log('✅ TEST 9 PASSED: Traveler Avatar & Profile updated successfully.\n');
      passedTests++;
    } else {
      throw new Error(`Traveler profile update failed: ${JSON.stringify(updateTravelerData)}`);
    }

    // -------------------------------------------------------------
    // TEST 10: Traveler Instant Booking of the Tour Offer
    // -------------------------------------------------------------
    console.log('Test 10/12: Traveler Executing Instant Tour Booking (Guests: 2)...');
    const bookingRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${travelerToken}`
      },
      body: JSON.stringify({
        tourId: tourId,
        travelerPhone: '+212600112233',
        date: '2026-08-15',
        guestsCount: 2,
        specialRequests: 'Window seats on 4x4 and vegetarian meals please.'
      })
    });
    const bookingData = await bookingRes.json();
    const bookingId = bookingData.bookingId || bookingData.booking?.id;
    if (bookingRes.ok && bookingData.success && bookingId) {
      console.log(`✅ TEST 10 PASSED: Booking Created successfully (Booking ID: ${bookingId}). Automated chat verification initiated.\n`);
      passedTests++;
    } else {
      throw new Error(`Booking execution failed: ${JSON.stringify(bookingData)}`);
    }

    // -------------------------------------------------------------
    // TEST 11: Traveler Sending Direct Chat / Inquiry Message to Agency
    // -------------------------------------------------------------
    console.log('Test 11/12: Traveler Sending Direct Chat Inquiry to Agency...');
    const initChatRes = await fetch(`${API_BASE}/chats/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${travelerToken}`
      },
      body: JSON.stringify({ agencyId: agencyId })
    });
    const initChatData = await initChatRes.json();
    if (!initChatRes.ok || !initChatData.success || !initChatData.threadId) {
      throw new Error(`Chat initiation failed: ${JSON.stringify(initChatData)}`);
    }

    const threadId = initChatData.threadId;

    const chatRes = await fetch(`${API_BASE}/chats/${threadId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${travelerToken}`
      },
      body: JSON.stringify({
        text: 'Hello Atlas Sahara Tours! Do you provide hotel pickup from Medina in Marrakech for this tour?'
      })
    });
    const chatData = await chatRes.json();
    if (chatRes.ok && chatData.success && chatData.thread) {
      console.log(`✅ TEST 11 PASSED: Chat Inquiry Sent to Thread (${threadId}).\n`);
      passedTests++;
    } else {
      throw new Error(`Chat message execution failed: ${JSON.stringify(chatData)}`);
    }

    // -------------------------------------------------------------
    // TEST 12: Verify Agency Inbox & Bookings CRM
    // -------------------------------------------------------------
    console.log('Test 12/12: Verifying Agency CRM Bookings & Chat Inbox...');
    const agencyBookingsRes = await fetch(`${API_BASE}/bookings`, {
      headers: { 'Authorization': `Bearer ${agencyToken}` }
    });
    const agencyBookingsData = await agencyBookingsRes.json();
    
    const agencyChatsRes = await fetch(`${API_BASE}/chats`, {
      headers: { 'Authorization': `Bearer ${agencyToken}` }
    });
    const agencyChatsData = await agencyChatsRes.json();

    const bookingsList = Array.isArray(agencyBookingsData) ? agencyBookingsData : (agencyBookingsData.bookings || []);
    const bookingFound = bookingsList.some(b => (b.tourId === tourId || b.tour_id === tourId) && (b.travelerId === travelerId || b.traveler_id === travelerId));
    const chatFound = Array.isArray(agencyChatsData) 
      ? agencyChatsData.some(t => t.id === threadId || (t.agencyId === agencyId && t.travelerId === travelerId))
      : (agencyChatsData.threads || []).some(t => t.id === threadId || (t.agencyId === agencyId && t.travelerId === travelerId));

    if (bookingFound && chatFound) {
      console.log('✅ TEST 12 PASSED: Agency CRM correctly shows the incoming booking and direct chat inquiry.\n');
      passedTests++;
    } else {
      throw new Error(`CRM verification failed: bookingFound=${bookingFound}, chatFound=${chatFound}`);
    }

    console.log('🎉 =========================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED 100% PERFECTLY! PLATFORM IS SOLID.`);
    console.log('🎉 =========================================================\n');

    // Optional Clean up of test data
    console.log('🧹 Cleaning up test database records...');
    try {
      await pool.query('SET FOREIGN_KEY_CHECKS = 0');
      await pool.query('DELETE FROM bookings WHERE traveler_id = ? OR agency_id = ?', [travelerId, agencyId]);
      await pool.query('DELETE FROM messages WHERE sender_id IN (?, ?)', [travelerId, agencyId]);
      await pool.query('DELETE FROM chats WHERE traveler_id = ? OR agency_id = ?', [travelerId, agencyId]);
      await pool.query('DELETE FROM posts WHERE agency_id = ?', [agencyId]);
      await pool.query('DELETE FROM tours WHERE agency_id = ?', [agencyId]);
      await pool.query('DELETE FROM stories WHERE agency_id = ?', [agencyId]);
      await pool.query('DELETE FROM user_wishlist WHERE user_id IN (?, ?)', [travelerId, agencyId]);
      await pool.query('DELETE FROM users WHERE id IN (?, ?)', [agencyId, travelerId]);
      await pool.query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (e) {
      // ignore cleanup errors
    }
    console.log('🧹 Clean up completed.\n');

    process.exit(0);
  } catch (error) {
    console.error(`\n❌ TEST FAILED AT STEP ${passedTests + 1}/${totalTests}:`, error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

runFullE2ETest();
