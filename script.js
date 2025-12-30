// --- CONFIGURAZIONE FIREBASE ---
// 1. Vai sulla console Firebase > Impostazioni progetto > Generali > Le tue app
// 2. Copia l'oggetto "firebaseConfig" e INCOLLALO qui sotto al posto di quello vuoto:

const firebaseConfig = {
    apiKey: "AIzaSyB_43zHxg9H43UrXYX8CcwYgKjMPpzl1rk",
    authDomain: "mia-libreria.firebaseapp.com",
    projectId: "mia-libreria",
    storageBucket: "mia-libreria.firebasestorage.app",
    messagingSenderId: "349757686044",
    appId: "1:349757686044:web:00f1423d133ae7339afad9"
  };


// Inizializza Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Variabili globali
let currentUser = null; // null = ospite, object = loggato
let myBooks = [];
let isGuest = false;

// --- GESTIONE LOGIN ---

// Controlla se l'utente era già loggato all'apertura
auth.onAuthStateChanged(user => {
    if (user) {
        // Utente loggato con Google
        handleUserLogin(user);
    } else {
        // Nessun utente loggato, mostra overlay se non è ospite
        if (!isGuest) {
            document.getElementById('login-overlay').style.display = 'flex';
        }
    }
});

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then((result) => {
            handleUserLogin(result.user);
        }).catch((error) => {
            console.error("Errore login:", error);
            alert("Errore login: " + error.message);
        });
}

function loginAsGuest() {
    isGuest = true;
    currentUser = null;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = "Modalità Ospite (Locale)";
    
    // Carica da LocalStorage
    myBooks = JSON.parse(localStorage.getItem('myLibrary')) || [];
    renderLibrary();
}

function handleUserLogin(user) {
    currentUser = user;
    isGuest = false;
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('user-display-name').innerText = user.displayName;
    
    // Carica da Firestore
    loadFromFirebase();
}

function logout() {
    if (isGuest) {
        location.reload(); // Ricarica la pagina per mostrare il login
    } else {
        auth.signOut().then(() => {
            location.reload();
        });
    }
}

// --- GESTIONE DATI (SALVATAGGIO IBRIDO) ---

// Carica libri (differenzia tra Cloud e Locale)
function loadFromFirebase() {
    const libContainer = document.getElementById('my-library');
    libContainer.innerHTML = '<p class="loading-msg">Sincronizzazione cloud...</p>';

    db.collection('users').doc(currentUser.uid).collection('books').get().then((querySnapshot) => {
        myBooks = [];
        querySnapshot.forEach((doc) => {
            myBooks.push(doc.data());
        });
        // Ordina per data (più recenti in alto)
        myBooks.sort((a, b) => b.id - a.id);
        renderLibrary();
    }).catch((error) => {
        console.error("Errore caricamento:", error);
        libContainer.innerHTML = '<p>Errore scaricamento dati.</p>';
    });
}

// Salva un libro (differenzia tra Cloud e Locale)
function saveBookData(newBook) {
    if (isGuest) {
        // Salva in Locale
        myBooks.unshift(newBook);
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary();
    } else {
        // Salva in Cloud
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(newBook.id)).set(newBook)
            .then(() => {
                myBooks.unshift(newBook); // Aggiorna anche la vista locale per velocità
                renderLibrary();
            })
            .catch((error) => {
                console.error("Errore salvataggio:", error);
                alert("Errore salvataggio su Cloud");
            });
    }
}

// Aggiorna stato (Letto/Posseduto)
function updateBookStatus(id, type) {
    const bookIndex = myBooks.findIndex(b => b.id === id);
    if (bookIndex === -1) return;

    // Inverti lo stato
    myBooks[bookIndex][type] = !myBooks[bookIndex][type];
    const updatedBook = myBooks[bookIndex];

    if (isGuest) {
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary(); // Ricarica vista
    } else {
        // Aggiorna solo il campo specifico su Firebase
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).update({
            [type]: updatedBook[type]
        }).then(() => {
            renderLibrary(); // Ricarica vista
        });
    }
}

// Rimuovi libro
function removeBookData(id) {
    if (!confirm('Eliminare questo libro?')) return;

    if (isGuest) {
        myBooks = myBooks.filter(b => b.id !== id);
        localStorage.setItem('myLibrary', JSON.stringify(myBooks));
        renderLibrary();
    } else {
        db.collection('users').doc(currentUser.uid).collection('books').doc(String(id)).delete()
            .then(() => {
                myBooks = myBooks.filter(b => b.id !== id);
                renderLibrary();
            }).catch((error) => {
                console.error("Errore eliminazione:", error);
            });
    }
}


// --- RICERCA E UI (Quasi identico a prima) ---

async function searchBooks() {
    const query = document.getElementById('search-input').value;
    const resultsContainer = document.getElementById('search-results');
    document.getElementById('search-input').blur();

    if (!query) return;
    resultsContainer.innerHTML = '<p style="text-align:center; width:100%;">Ricerca...</p>';

    try {
        const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=6`);
        const data = await response.json();
        resultsContainer.innerHTML = '';

        if (!data.items) { resultsContainer.innerHTML = '<p style="text-align:center;">Nessun risultato.</p>'; return; }

        data.items.forEach(book => {
            const info = book.volumeInfo;
            const thumbnail = info.imageLinks ? info.imageLinks.thumbnail : 'https://via.placeholder.com/128x192?text=No+Cover';
            const safeTitle = info.title.replace(/'/g, "\\'");
            const safeAuthor = (info.authors ? info.authors[0] : 'Sconosciuto').replace(/'/g, "\\'");

            const bookEl = document.createElement('div');
            bookEl.className = 'book-card';
            bookEl.innerHTML = `
                <img src="${thumbnail}" alt="Cover">
                <h3>${info.title}</h3>
                <p>${info.authors ? info.authors[0] : '...'}</p>
                <button class="btn-add" onclick="prepareAddBook('${safeTitle}', '${safeAuthor}', '${thumbnail}')">
                    <i class="fas fa-plus"></i> Aggiungi
                </button>
            `;
            resultsContainer.appendChild(bookEl);
        });
    } catch (e) { resultsContainer.innerHTML = '<p>Errore.</p>'; }
}

function prepareAddBook(title, author, image) {
    const exists = myBooks.some(book => book.title === title);
    if (exists) { alert('Libro già presente!'); return; }

    const newBook = {
        id: Date.now(),
        title: title, author: author, image: image,
        owned: false, read: false
    };

    saveBookData(newBook);
    
    // Feedback
    const btn = event.target.closest('button');
    btn.innerHTML = '<i class="fas fa-check"></i>';
    btn.style.backgroundColor = '#1dd1a1';
}

function renderLibrary(filterType = 'all') {
    const container = document.getElementById('my-library');
    container.innerHTML = '';

    // Recupera filtro attivo
    const activeBtn = document.querySelector('.filters button.active');
    if (activeBtn && filterType === 'all') {
        if(activeBtn.getAttribute('onclick').includes('owned')) filterType = 'owned';
        if(activeBtn.getAttribute('onclick').includes('read')) filterType = 'read';
    }

    let filtered = myBooks;
    if (filterType === 'owned') filtered = myBooks.filter(b => b.owned);
    if (filterType === 'read') filtered = myBooks.filter(b => b.read);

    if (filtered.length === 0) {
        container.innerHTML = '<p class="loading-msg" style="width:100%; text-align:center; color:#999;">Nessun libro.</p>';
        return;
    }

    filtered.forEach(book => {
        const div = document.createElement('div');
        div.className = 'book-card';
        div.innerHTML = `
            <button class="btn-delete" onclick="removeBookData(${book.id})"><i class="fas fa-times"></i></button>
            <img src="${book.image}" alt="Cover">
            <div class="card-content">
                <h3>${book.title}</h3>
                <p>${book.author}</p>
                <div class="status-area">
                    <div class="badge ${book.owned ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'owned')">Preso</div>
                    <div class="badge ${book.read ? 'active' : ''}" onclick="updateBookStatus(${book.id}, 'read')">Letto</div>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

function filterLibrary(type) {
    document.querySelectorAll('.filters button').forEach(b => b.classList.remove('active'));
    event.target.closest('button').classList.add('active');
    renderLibrary(type);
}

function shareLibrary() {
    let text = "📚 I miei Libri:\n\n";
    myBooks.forEach(b => text += `- ${b.title}\n`);
    navigator.clipboard.writeText(text).then(() => alert("Copiato!")).catch(() => alert("Errore copia"));
}