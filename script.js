// --- FIREBASE CONFIGURATION ---
// ⚠️ PASTE YOUR CONFIGURATION HERE AGAIN!
const firebaseConfig = {
    apiKey: "AIzaSyB_43zHxg9H43UrXYX8CcwYgKjMPpzl1rk",
    authDomain: "mia-libreria.firebaseapp.com",
    projectId: "mia-libreria",
    storageBucket: "mia-libreria.firebasestorage.app",
    messagingSenderId: "349757686044",
    appId: "1:349757686044:web:00f1423d133ae7339afad9"
  };


if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let currentUser = null;
let myBooks = [];
let isGuest = false;
let currentDetailId = null;
let tempRating = 0;
let currentSort = 'newest';
let readingGoal = 12;

// --- LOGIN ---
auth.onAuthStateChanged(user => {
    if (user) handleUserLogin(user);
    else if (!isGuest) document.getElementById('login-overlay').style.display = 'flex';
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).then((r) => handleUserLogin(r.user)).catch(e => alert(e.message));
}
function loginAsGuest() {
    isGuest = true; currentUser = null;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = "Guest Mode";
    document.getElementById('profile-name-large').innerText = "Guest User";
    
    const localPhoto = localStorage.getItem('profilePic');
    if(localPhoto) document.getElementById('profile-pic-display').src = localPhoto;
    if (localStorage.getItem('darkMode') === 'true') toggleDarkMode(false);
    const savedGoal = localStorage.getItem('readingGoal');
    if(savedGoal) readingGoal = parseInt(savedGoal);

    myBooks = JSON.parse(localStorage.getItem('myLibrary')) || [];
    renderLibrary(); calculateStats();
}
function handleUserLogin(user) {
    currentUser = user; isGuest = false;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = user.displayName;
    document.getElementById('profile-name-large').innerText = user.displayName;
    if (user.photoURL) document.getElementById('profile-pic-display').src = user.photoURL;
    if (localStorage.getItem('darkMode') === 'true') toggleDarkMode(false);
    loadFromFirebase();
}
function logout() { (isGuest) ? location.reload() : auth.signOut().then(() => location.reload()); }

// --- SUGGESTIONS ENGINE (NEW) ---
async function generateSuggestions(forceRefresh = false) {
    const container = document.getElementById('suggestions-grid');
    const reasonBox = document.getElementById('suggestion-reason');
    
    // Only run if empty or forced
    if (container.children.length > 1 && !forceRefresh) return;
    
    if (myBooks.length === 0) {
        container.innerHTML = '<p style="text-align:center;width:100%">Add some books to your library first!</p>';
        reasonBox.style.display = 'none';
        return;
    }

    container.innerHTML = '<p class="loading-msg">Finding good reads...</p>';
    reasonBox.style.display = 'none';

    // 1. Pick random book from collection
    const randomBook = myBooks[Math.floor(Math.random() * myBooks.length)];
    const author = randomBook.author;

    // 2. Search by Author
    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=inauthor:"${encodeURIComponent(author)}"&maxResults=10&langRestrict=en`);
        const data = await response.json();
        
        container.innerHTML = '';

        if (!data.items) {
            container.innerHTML = '<p>No suggestions found this time. Try refreshing!</p>';
            return;
        }

        // 3. Filter out books user already owns
        const suggestions = data.items.filter(item => {
            // Check if title exists in myBooks
            return !myBooks.some(myBook => myBook.title.toLowerCase() === item.volumeInfo.title.toLowerCase());
        }).slice(0, 6); // Take top 6

        if (suggestions.length === 0) {
            container.innerHTML = '<p>You seem to have all the books by this author! Refresh for another pick.</p>';
            return;
        }

        // 4. Show "Why"
        reasonBox.innerHTML = `Because you have <strong>${randomBook.title}</strong> by ${author}`;
        reasonBox.style.display = 'block';

        // 5. Render
        suggestions.forEach(book => {
            const i = book.volumeInfo;
            const img = i.imageLinks ? i.imageLinks.thumbnail : 'https://via.placeholder.com/128x192?text=No+Cover';
            const safeTitle = i.title.replace(/'/g, "\\'");
            const safeAuthor = (i.authors ? i.authors[0] : 'Unknown').replace(/'/g, "\\'");
            const year = i.publishedDate ? i.publishedDate.substring(0, 4) : 'N/A';

            const el = document.createElement('div');
            el.className = 'book-card';
            // Reuse prepareAddBook logic
            el.innerHTML = `
                <img src="${img}" alt="Cover">
                <h3>${i.title}</h3>
                <p>${i.authors ? i.authors[0] : 'Unknown'}</p>
                <button class="btn-add" onclick="prepareAddBook('${safeTitle}', '${safeAuthor}', '${img}', '${year}')">
                    <i class="fas fa-plus"></i> Add
                </button>
            `;
            container.appendChild(el);
        });

    } catch (e) {
        container.innerHTML = '<p>Error fetching suggestions.</p>';
    }
}

// --- VIEW SWITCHING ---
function switchView(viewName) {
    document.getElementById('view-search').style.display = 'none';
    document.getElementById('view-collection').style.display = 'none';
    document.getElementById('view-stats').style.display = 'none';
    document.getElementById('view-suggestions').style.display = 'none'; // Hide suggestions

    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

    document.getElementById('view-' + viewName).style.display = 'block';
    document.getElementById('nav-' + viewName).classList.add('active');

    if (viewName === 'stats') calculateStats();
    if (viewName === 'suggestions') generateSuggestions(); // Trigger suggestions
}

// --- DARK MODE ---
function toggleDarkMode(save = true) {
    document.body.classList.toggle('dark-mode');
    if (save) localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

// --- PROFILE PHOTO ---
function uploadProfilePhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image(); img.src = e.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
                const MAX_WIDTH = 300; let width = img.width; let height = img.height;
                if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
                else { if (height > MAX_WIDTH) { width *= MAX_WIDTH / height; height = MAX_WIDTH; } }
                canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                document.getElementById('profile-pic-display').src = compressedBase64;
                if (isGuest) localStorage.setItem('profilePic', compressedBase64);
                else db.collection('users').doc(currentUser.uid).collection('info').doc('profile').set({ photo: compressedBase64 }, { merge: true });
            }
        }
        reader.readAsDataURL(file);
    }
}

// --- STATS ---
function saveGoal() {
    readingGoal = parseInt(document.getElementById('challenge-goal').value);
    if (!isGuest) db.collection('users').doc(currentUser.uid).collection('info').doc('settings').set({ goal: readingGoal }, { merge: true });
    else localStorage.setItem('readingGoal', readingGoal);
    calculateStats();
}
function calculateStats() {
    const total = myBooks.length; const owned = myBooks.filter(b => b.owned).length; const read = myBooks.filter(b => b.read).length;
    document.getElementById('stat-total').innerText = total; document.getElementById('stat-owned').innerText = owned; document.getElementById('stat-read').innerText = read;
    document.getElementById('challenge-goal').value = readingGoal; document.getElementById('challenge-target-display').innerText = readingGoal; document.getElementById('challenge-read-count').innerText = read;
    let percentage = (read / readingGoal) * 100; if (percentage > 100) percentage = 100; document.getElementById('challenge-progress').style.width = percentage + '%';
    const authorCounts = {}; myBooks.forEach(book => { const author = book.author; authorCounts[author] = (authorCounts[author] || 0) + 1; });
    const sortedAuthors = Object.entries(authorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const list = document.getElementById('top-authors-list'); list.innerHTML = '';
    if (sortedAuthors.length === 0) list.innerHTML = '<li><span>No books yet</span></li>';
    else sortedAuthors.forEach(([author, count]) => { const li = document.createElement('li'); li.innerHTML = `<span>${author}</span> <span class="count">${count} books</span>`; list.appendChild(li); });
}

// --- BOOK DETAIL ---
function openBookDetails(id) {
    const book = myBooks.find(b => b.id === id); if (!book) return;
    currentDetailId = id; tempRating = book.rating || 0;
    document.getElementById('detail-img').src = book.image; document.getElementById('detail-title').innerText = book.title; document.getElementById('detail-author').innerText = book.author; document.getElementById('detail-year').innerText = "Published: " + (book.year || "Unknown"); document.getElementById('detail-notes').value = book.notes || "";
    document.getElementById('date-start').value = book.startDate || ""; document.getElementById('date-finish').value = book.finishDate || "";
    const durText = document.getElementById('reading-duration');
    if (book.startDate && book.finishDate) {
        const days = Math.ceil((new Date(book.finishDate) - new Date(book.startDate)) / (1000 * 60 * 60 * 24));
        durText.innerText = days >= 0 ? `Read in ${days} days` : "";
    } else durText.innerText = "";
    updateStarVisuals(tempRating); document.getElementById('detail-overlay').style.display = 'flex'; 
}
function saveBookDetails() {
    if (!currentDetailId) return;
    const notes = document.getElementById('detail-notes').value; const startDate = document.getElementById('date-start').value; const finishDate = document.getElementById('date-finish').value;
    const bookIndex = myBooks.findIndex(b => b.id === currentDetailId);
    if (bookIndex !== -1) {
        myBooks[bookIndex].rating = tempRating; myBooks[bookIndex].notes = notes; myBooks[bookIndex].startDate = startDate; myBooks[bookIndex].finishDate = finishDate;
        if (finishDate && !myBooks[bookIndex].read) { myBooks[bookIndex].read = true; myBooks[bookIndex].reading = false; }
        if (isGuest) { localStorage.setItem('myLibrary', JSON.stringify(myBooks)); closeBookDetails(); renderLibrary(); calculateStats(); }
        else { db.collection('users').doc(currentUser.uid).collection('books').doc(String(currentDetailId)).update({ rating: tempRating, notes: notes, startDate: startDate, finishDate: finishDate, read: myBooks[bookIndex].read, reading: myBooks[bookIndex].reading }).then(() => { closeBookDetails(); renderLibrary(); calculateStats(); }).catch(e => alert(e.message)); }
    }
}
function closeBookDetails() { document.getElementById('detail-overlay').style.display = 'none'; currentDetailId = null; }
function setRating(n) { tempRating = n; updateStarVisuals(n); }
function updateStarVisuals(n) { document.querySelectorAll('#star-container i').forEach((star, index) => { star.className = index < n ? 'fas fa-star gold' : 'far fa-star'; }); }

// --- DATA ---
function loadFromFirebase() {
    db.collection('users').doc(currentUser.uid).collection('info').doc('settings').get().then((doc) => {
        if (doc.exists && doc.data().goal) readingGoal = doc.data().goal;
        db.collection('users').doc(currentUser.uid).collection('books').get().then((snap) => {
            myBooks = []; snap.forEach((doc) => myBooks.push(doc.data())); renderLibrary(); calculateStats();
        });
    });
    db.collection('users').doc(currentUser.uid).collection('info').doc('profile').get().then((doc) => { if (doc.exists && doc.data().photo) document.getElementById('profile-pic-display').src = doc.data().photo; });
}
function saveBookData(newBook) {
    if (isGuest) { myBooks.unshift(newBook); localStorage.setItem('myLibrary', JSON.stringify(myBooks)); renderLibrary(); calculateStats(); }
    else { db.collection('users').doc(currentUser.uid).collection('books').doc(String(newBook.id)).set(newBook).then(() => { myBooks.unshift(newBook); renderLibrary(); calculateStats(); }); }
}
function updateBookStatus(id, type) {
    const idx = myBooks.findIndex(b => b.id === id); if (idx === -1) return;
    myBooks[idx][type] = !myBooks[idx][type];
    if (type === 'read' && myBooks[idx].read) myBooks[idx].reading = false;
    if (isGuest) { localStorage.setItem('myLibrary', JSON.stringify(myBooks)); renderLibrary(); calculateStats(); }
    else { db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).set(myBooks[idx]).then(() => { renderLibrary(); calculateStats(); }); }
}
function removeBookData(id) {
    if (!confirm('Delete?')) return;
    if (isGuest) { myBooks = myBooks.filter(b => b.id !== id); localStorage.setItem('myLibrary', JSON.stringify(myBooks)); renderLibrary(); calculateStats(); }
    else { db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).delete().then(() => { myBooks = myBooks.filter(b => b.id !== id); renderLibrary(); calculateStats(); }); }
}

// --- SEARCH ---
async function searchBooks() {
    const q = document.getElementById('search-input').value; const res = document.getElementById('search-results'); document.getElementById('search-input').blur(); if (!q) return;
    res.innerHTML = '<p style="text-align:center;">Searching...</p>';
    try {
        const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=6&langRestrict=en`); const d = await r.json(); res.innerHTML = '';
        if (!d.items) { res.innerHTML = '<p>No results.</p>'; return; }
        d.items.forEach(book => {
            const i = book.volumeInfo; const img = i.imageLinks ? i.imageLinks.thumbnail : 'https://via.placeholder.com/128x192?text=No+Cover';
            const safeTitle = i.title.replace(/'/g, "\\'"); const safeAuthor = (i.authors ? i.authors[0] : 'Unknown').replace(/'/g, "\\'");
            const year = i.publishedDate ? i.publishedDate.substring(0, 4) : 'N/A';
            const el = document.createElement('div'); el.className = 'book-card';
            el.innerHTML = `<img src="${img}" alt="Cover"><h3>${i.title}</h3><p>${i.authors ? i.authors[0] : 'Unknown'}</p><button class="btn-add" onclick="prepareAddBook('${safeTitle}', '${safeAuthor}', '${img}', '${year}')"><i class="fas fa-plus"></i> Add</button>`;
            res.appendChild(el);
        });
    } catch (e) { res.innerHTML = '<p>Error.</p>'; }
}
function prepareAddBook(title, author, image, year) {
    if (myBooks.some(b => b.title === title)) { alert('Already added!'); return; }
    const newBook = { id: Date.now(), title: title, author: author, image: image, year: year, owned: false, read: false, reading: false, rating: 0, notes: "", startDate: "", finishDate: "" };
    saveBookData(newBook);
    const btn = event.target.closest('button'); btn.innerHTML = '<i class="fas fa-check"></i>'; btn.style.backgroundColor = '#1dd1a1';
}
function changeSort() { currentSort = document.getElementById('sort-select').value; renderLibrary(); }
function renderLibrary(filter = 'all') {
    const c = document.getElementById('my-library'); c.innerHTML = '';
    const ab = document.querySelector('.filters button.active');
    if (ab && filter === 'all') { const t = ab.innerText.toLowerCase(); if(t.includes('reading')) filter = 'reading'; else if(t.includes('read')) filter = 'read'; else if(t.includes('owned')) filter = 'owned'; }
    let fBooks = myBooks.slice();
    if (filter === 'owned') fBooks = fBooks.filter(b => b.owned);
    if (filter === 'read') fBooks = fBooks.filter(b => b.read);
    if (filter === 'reading') fBooks = fBooks.filter(b => b.reading);
    if (currentSort === 'title') fBooks.sort((a, b) => a.title.localeCompare(b.title));
    else if (currentSort === 'author') fBooks.sort((a, b) => a.author.localeCompare(b.author));
    else fBooks.sort((a, b) => b.id - a.id);
    if (fBooks.length === 0) { c.innerHTML = '<p class="loading-msg" style="width:100%;text-align:center;color:#999;">No books.</p>'; return; }
    fBooks.forEach(book => {
        const el = document.createElement('div'); el.className = 'book-card';
        el.innerHTML = `<button class="btn-delete" onclick="removeBookData(${book.id})"><i class="fas fa-times"></i></button><img src="${book.image}" alt="Cover" onclick="openBookDetails(${book.id})"><div class="card-content"><h3 onclick="openBookDetails(${book.id})" style="cursor:pointer">${book.title}</h3><p>${book.author}</p><div class="status-area"><div class="badge ${book.owned ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'owned')">Owned</div><div class="badge reading-badge ${book.reading ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'reading')">Reading</div><div class="badge ${book.read ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'read')">Read</div></div></div>`;
        c.appendChild(el);
    });
}
function filterLibrary(type) { document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active')); event.target.closest('button').classList.add('active'); renderLibrary(type); }