// Focus Tracker Reader - Track words that break your attention

class FocusTrackerReader {
    constructor() {
        this.markedWords = new Map(); // word -> count
        this.removedWords = []; // Array of {markedText, before, after}
        this.markingMode = false;
        this.words = [];
        this.originalText = '';
        this.textIsHidden = false;
        this.hiddenFromIndex = -1;
        
        // Dragging state
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        
        // PDF state
        this.loadedPdf = null;
        this.pdfFileName = '';
        
        // File System Access API handles for different note types
        this.notesFileHandles = {
            car: null,
            files: null,
            passwords: null,
            chess: null,
            business: null,
            lotiontape: null,
            investing: null,
            blender: null,
            organicchemistry: null,
            math: null,
            biology: null,
            '3dprinting': null,
            reader: null
        };
        this.currentNoteType = null; // Track which note type is currently being edited
        this.db = null; // IndexedDB for persisting file handles
        
        this.init();
    }
    
    init() {
        this.cacheElements();
        this.attachEventListeners();
        this.initPdfJs();
        this.checkFileSystemSupport();
        this.initIndexedDB();
    }
    
    async initIndexedDB() {
        // Initialize IndexedDB to store file handle persistently
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FocusTrackerDB', 1);
            
            request.onerror = () => {
                console.error('IndexedDB failed to open');
                resolve(); // Continue without IndexedDB
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.loadFileHandle();
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('fileHandles')) {
                    db.createObjectStore('fileHandles');
                }
            };
        });
    }
    
    async loadFileHandle() {
        // Try to load the saved file handles from IndexedDB
        if (!this.db) return;
        
        const noteTypes = ['car', 'files', 'passwords', 'chess', 'business', 'lotiontape', 'investing', 'blender', 'organicchemistry', 'math', 'biology', '3dprinting', 'reader'];
        
        for (const noteType of noteTypes) {
            try {
                const transaction = this.db.transaction(['fileHandles'], 'readonly');
                const store = transaction.objectStore('fileHandles');
                const request = store.get(`${noteType}NotesFileHandle`);
                
                await new Promise((resolve, reject) => {
                    request.onsuccess = async (event) => {
                        const handle = event.target.result;
                        if (handle) {
                            try {
                                // Verify we still have permission
                                const permission = await handle.queryPermission({ mode: 'readwrite' });
                                if (permission === 'granted' || permission === 'prompt') {
                                    this.notesFileHandles[noteType] = handle;
                                    console.log(`${noteType} file handle loaded from IndexedDB`);
                                }
                            } catch (error) {
                                console.log(`Saved ${noteType} file handle is no longer valid`);
                                this.notesFileHandles[noteType] = null;
                            }
                        }
                        resolve();
                    };
                    
                    request.onerror = () => {
                        console.error(`Error loading ${noteType} file handle`);
                        resolve();
                    };
                });
            } catch (error) {
                console.error(`Error loading ${noteType} file handle:`, error);
            }
        }
    }
    
    async saveFileHandle(handle, noteType) {
        // Save the file handle to IndexedDB for persistence
        if (!this.db) return;
        
        try {
            const transaction = this.db.transaction(['fileHandles'], 'readwrite');
            const store = transaction.objectStore('fileHandles');
            store.put(handle, `${noteType}NotesFileHandle`);
            console.log(`${noteType} file handle saved to IndexedDB`);
        } catch (error) {
            console.error(`Error saving ${noteType} file handle:`, error);
        }
    }
    
    initPdfJs() {
        // Set up PDF.js worker
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
    }
    
    checkFileSystemSupport() {
        // Check if File System Access API is supported
        this.fileSystemSupported = 'showSaveFilePicker' in window;
        if (!this.fileSystemSupported) {
            console.warn('File System Access API not supported. Notes will be downloaded as separate files.');
        }
    }
    
    cacheElements() {
        this.textInput = document.getElementById('textInput');
        this.pdfUpload = document.getElementById('pdfUpload');
        this.uploadStatus = document.getElementById('uploadStatus');
        this.pageSelectionPanel = document.getElementById('pageSelectionPanel');
        this.pdfFileNameDisplay = document.getElementById('pdfFileName');
        this.totalPagesDisplay = document.getElementById('totalPages');
        this.pageFrom = document.getElementById('pageFrom');
        this.pageTo = document.getElementById('pageTo');
        this.extractPagesBtn = document.getElementById('extractPagesBtn');
        this.startReadingBtn = document.getElementById('startReadingBtn');
        this.readingSection = document.getElementById('readingSection');
        this.markingModeToggle = document.getElementById('markingModeToggle');
        this.markingModeToggleFloat = document.getElementById('markingModeToggleFloat');
        this.modeLabel = document.getElementById('modeLabel');
        this.modeLabelFloat = document.getElementById('modeLabelFloat');
        this.readingContent = document.getElementById('readingContent');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.continueBtn = document.getElementById('continueBtn');
        this.markedCount = document.getElementById('markedCount');
        this.removedCount = document.getElementById('removedCount');
        this.showSummaryBtn = document.getElementById('showSummaryBtn');
        this.floatingControls = document.getElementById('floatingControls');
        this.summaryPanel = document.getElementById('summaryPanel');
        this.closeSummaryBtn = document.getElementById('closeSummaryBtn');
        this.totalMarked = document.getElementById('totalMarked');
        this.uniqueMarked = document.getElementById('uniqueMarked');
        this.summaryList = document.getElementById('summaryList');
        this.exportBtn = document.getElementById('exportBtn');
        this.copyBtn = document.getElementById('copyBtn');
        
        // Notes modal elements
        this.notesModal = document.getElementById('notesModal');
        this.notesTextarea = document.getElementById('notesTextarea');
        this.saveNotesBtn = document.getElementById('saveNotesBtn');
        this.cancelNotesBtn = document.getElementById('cancelNotesBtn');
    }
    
    attachEventListeners() {
        this.startReadingBtn.addEventListener('click', () => this.startReading());
        this.pdfUpload.addEventListener('change', (e) => this.handlePdfUpload(e));
        this.extractPagesBtn.addEventListener('click', () => this.extractSelectedPages());
        this.markingModeToggle.addEventListener('change', (e) => this.toggleMarkingMode(e.target.checked));
        this.markingModeToggleFloat.addEventListener('change', (e) => this.toggleMarkingMode(e.target.checked));
        this.showSummaryBtn.addEventListener('click', () => this.showSummary());
        this.closeSummaryBtn.addEventListener('click', () => this.hideSummary());
        
        // Floating control buttons
        this.clearMarksBtnFloat = document.getElementById('clearMarksBtnFloat');
        
        if (this.clearMarksBtnFloat) {
            this.clearMarksBtnFloat.addEventListener('click', () => this.clearAllMarks());
        }
        
        // Notes dropdown
        this.notesBtnFloat = document.getElementById('notesBtnFloat');
        this.notesDropdown = document.getElementById('notesDropdown');
        
        if (this.notesBtnFloat && this.notesDropdown) {
            // Toggle dropdown or open notes depending on whether a type is selected
            this.notesBtnFloat.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // If a note type is already selected, open notes directly
                if (this.currentNoteType) {
                    this.openNotes(this.currentNoteType);
                } else {
                    // Otherwise show the dropdown to select a type
                    this.toggleNotesDropdown();
                }
            });
            
            // Handle dropdown item clicks
            const dropdownItems = this.notesDropdown.querySelectorAll('.notes-dropdown-item');
            dropdownItems.forEach(item => {
                item.addEventListener('click', (e) => {
                    const noteType = e.target.getAttribute('data-note-type');
                    // Set this as the current note type for the session
                    this.currentNoteType = noteType;
                    this.hideNotesDropdown();
                    this.openNotes(noteType);
                });
            });
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (this.notesDropdown && 
                    this.notesDropdown.style.display === 'block' &&
                    !this.notesDropdown.contains(e.target) &&
                    e.target !== this.notesBtnFloat) {
                    this.hideNotesDropdown();
                }
            });
        }
        
        this.exportBtn.addEventListener('click', () => this.exportList());
        this.copyBtn.addEventListener('click', () => this.copyToClipboard());
        this.continueBtn.addEventListener('click', () => this.continueReading());
        
        // Dragging functionality for floating controls
        this.setupDragging();
        
        // Capture paste events to preserve HTML formatting
        this.textInput.addEventListener('paste', (e) => this.handlePaste(e));
        
        // Notes modal event listeners
        if (this.saveNotesBtn) {
            this.saveNotesBtn.addEventListener('click', () => this.saveNotes());
        }
        if (this.cancelNotesBtn) {
            this.cancelNotesBtn.addEventListener('click', () => this.closeNotes());
        }
        
        // Create overlay for summary panel
        this.createOverlay();
    }
    
    handlePaste(event) {
        // Check if clipboard contains HTML
        const clipboardData = event.clipboardData || window.clipboardData;
        const htmlData = clipboardData.getData('text/html');
        
        if (htmlData) {
            // Prevent default paste
            event.preventDefault();
            
            // Insert HTML into textarea (will be processed when user clicks Start Reading)
            const selection = this.textInput.selectionStart;
            const textBefore = this.textInput.value.substring(0, selection);
            const textAfter = this.textInput.value.substring(this.textInput.selectionEnd);
            
            this.textInput.value = textBefore + htmlData + textAfter;
        }
        // If no HTML, let default paste behavior happen
    }
    
    setupDragging() {
        const dragHandle = this.floatingControls.querySelector('.drag-handle');
        
        dragHandle.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            const rect = this.floatingControls.getBoundingClientRect();
            this.dragOffsetX = e.clientX - rect.left;
            this.dragOffsetY = e.clientY - rect.top;
            
            // Remove transform to switch to absolute positioning
            this.floatingControls.style.transform = 'none';
            
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            const x = e.clientX - this.dragOffsetX;
            const y = e.clientY - this.dragOffsetY;
            
            // Keep within viewport bounds
            const maxX = window.innerWidth - this.floatingControls.offsetWidth;
            const maxY = window.innerHeight - this.floatingControls.offsetHeight;
            
            const boundedX = Math.max(0, Math.min(x, maxX));
            const boundedY = Math.max(0, Math.min(y, maxY));
            
            this.floatingControls.style.left = boundedX + 'px';
            this.floatingControls.style.top = boundedY + 'px';
            this.floatingControls.style.right = 'auto';
        });
        
        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }
    
    createOverlay() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'summary-overlay';
        this.overlay.addEventListener('click', () => this.hideSummary());
        document.body.appendChild(this.overlay);
    }
    
    async handlePdfUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Check if it's a TXT file (check both MIME type and file extension)
        const isTxtFile = file.type === 'text/plain' || 
                          file.type === '' && file.name.toLowerCase().endsWith('.txt') ||
                          file.name.toLowerCase().endsWith('.txt');
        
        if (isTxtFile) {
            this.uploadStatus.textContent = 'Loading text file...';
            this.uploadStatus.className = 'upload-status';
            
            try {
                // Read the text file
                const text = await file.text();
                
                // Put the text directly into the textarea
                this.textInput.value = text;
                
                this.uploadStatus.textContent = '✓ Text file loaded successfully';
                this.uploadStatus.className = 'upload-status';
                
            } catch (error) {
                console.error('Text file loading error:', error);
                this.uploadStatus.textContent = '✗ Error loading text file';
                this.uploadStatus.className = 'upload-status error';
            }
            return;
        }
        
        // Check if it's a PDF file
        const isPdfFile = file.type === 'application/pdf' || 
                          file.name.toLowerCase().endsWith('.pdf');
        
        // Handle PDF files
        if (!isPdfFile) {
            this.uploadStatus.textContent = 'Please upload a PDF or TXT file';
            this.uploadStatus.className = 'upload-status error';
            return;
        }
        
        this.uploadStatus.textContent = 'Loading PDF...';
        this.uploadStatus.className = 'upload-status';
        
        try {
            // Read file as array buffer
            const arrayBuffer = await file.arrayBuffer();
            
            // Load PDF
            this.loadedPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.pdfFileName = file.name;
            
            // Show page selection panel
            this.pageSelectionPanel.style.display = 'block';
            this.pdfFileNameDisplay.textContent = this.pdfFileName;
            this.totalPagesDisplay.textContent = this.loadedPdf.numPages;
            
            // Set default page range
            this.pageFrom.value = 1;
            this.pageTo.value = Math.min(10, this.loadedPdf.numPages);
            this.pageFrom.max = this.loadedPdf.numPages;
            this.pageTo.max = this.loadedPdf.numPages;
            
            this.uploadStatus.textContent = '✓ PDF loaded successfully';
            this.uploadStatus.className = 'upload-status';
            
        } catch (error) {
            console.error('PDF loading error:', error);
            this.uploadStatus.textContent = '✗ Error loading PDF';
            this.uploadStatus.className = 'upload-status error';
        }
    }
    
    async extractSelectedPages() {
        if (!this.loadedPdf) {
            alert('Please upload a PDF first');
            return;
        }
        
        const fromPage = parseInt(this.pageFrom.value) || 1;
        const toPage = parseInt(this.pageTo.value) || this.loadedPdf.numPages;
        
        if (fromPage < 1 || toPage > this.loadedPdf.numPages || fromPage > toPage) {
            alert(`Please enter valid page numbers between 1 and ${this.loadedPdf.numPages}`);
            return;
        }
        
        this.showLoadingIndicator();
        
        try {
            let extractedText = '';
            const totalPages = toPage - fromPage + 1;
            
            for (let pageNum = fromPage; pageNum <= toPage; pageNum++) {
                // Update progress
                const progress = ((pageNum - fromPage + 1) / totalPages) * 100;
                this.updateProgress(progress, `Extracting page ${pageNum} of ${toPage}...`);
                
                const page = await this.loadedPdf.getPage(pageNum);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                extractedText += pageText + '\n\n';
                
                // Small delay to allow UI updates
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            this.textInput.value = extractedText.trim();
            this.hideLoadingIndicator();
            
            alert(`Successfully extracted pages ${fromPage}-${toPage}`);
            
        } catch (error) {
            console.error('PDF extraction error:', error);
            this.hideLoadingIndicator();
            alert('Error extracting pages from PDF');
        }
    }
    
    showLoadingIndicator() {
        this.loadingIndicator.style.display = 'block';
    }
    
    hideLoadingIndicator() {
        this.loadingIndicator.style.display = 'none';
        this.progressFill.style.width = '0%';
        this.progressText.textContent = '0%';
    }
    
    updateProgress(percentage, message = 'Processing...') {
        const roundedPercentage = Math.round(percentage);
        this.progressFill.style.width = `${roundedPercentage}%`;
        this.progressText.textContent = `${roundedPercentage}%`;
        
        const loadingText = this.loadingIndicator.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = message;
        }
    }
    
    startReading() {
        let text = this.textInput.value.trim();
        
        if (!text) {
            alert('Please enter some text or upload a PDF first!');
            return;
        }
        
        // Check if text contains HTML tags
        const hasHtmlTags = /<[^>]*>/g.test(text);
        
        if (hasHtmlTags) {
            // Extract text from HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = text;
            text = tempDiv.textContent || tempDiv.innerText || '';
        }
        
        this.originalText = text;
        this.renderText();
        
        // Hide input section, show reading section
        document.querySelector('.input-section').style.display = 'none';
        this.readingSection.style.display = 'block';
        this.floatingControls.style.display = 'block';
    }
    
    renderText() {
        // Split text into words
        const words = this.originalText.split(/(\s+)/);
        
        // Create word elements
        this.readingContent.innerHTML = '';
        this.words = [];
        
        words.forEach((word, index) => {
            // Check if token is whitespace (spaces, tabs, newlines, etc.)
            if (/^\s+$/.test(word)) {
                // Preserve whitespace exactly as it is (including newlines)
                const textNode = document.createTextNode(word);
                this.readingContent.appendChild(textNode);
                return;
            }
            
            // Create word span for non-whitespace tokens
            const span = document.createElement('span');
            span.className = 'word';
            span.textContent = word;
            span.dataset.index = this.words.length;
            span.dataset.word = this.cleanWord(word);
            
            // Check if already marked
            const cleanedWord = this.cleanWord(word);
            if (this.markedWords.has(cleanedWord)) {
                span.classList.add('marked');
            }
            
            // Add click listener
            span.addEventListener('click', (e) => this.handleWordClick(e));
            
            this.readingContent.appendChild(span);
            this.words.push(word);
        });
    }
    
    handleWordClick(event) {
        if (!this.markingMode) return;
        
        // Prevent marking if text is currently hidden
        if (this.textIsHidden) return;
        
        const wordElement = event.target;
        const cleanedWord = this.cleanWord(wordElement.textContent);
        
        if (!cleanedWord || cleanedWord.trim().length === 0) return;
        
        // Toggle mark
        if (wordElement.classList.contains('marked')) {
            // Unmark
            this.unmarkWord(cleanedWord, wordElement);
        } else {
            // Mark
            this.markWord(cleanedWord, wordElement);
        }
        
        this.updateMarkedCount();
    }
    
    cleanWord(word) {
        // Remove punctuation and convert to lowercase for comparison
        return word.replace(/[.,!?;:'"()]/g, '').toLowerCase();
    }
    
    markWord(word, element) {
        // Add to marked words map
        if (this.markedWords.has(word)) {
            this.markedWords.set(word, this.markedWords.get(word) + 1);
        } else {
            this.markedWords.set(word, 1);
        }
        
        // Update UI
        element.classList.add('marked');
        
        // Hide text from this word onwards
        this.hideTextFromWord(element);
        
        // Visual feedback
        element.style.animation = 'none';
        setTimeout(() => {
            element.style.animation = '';
        }, 10);
    }
    
    hideTextFromWord(markedElement) {
        const wordElements = document.querySelectorAll('.word');
        let foundMarked = false;
        let markedIndex = -1;
        
        // Find the index of the marked element
        wordElements.forEach((el, index) => {
            if (el === markedElement) {
                foundMarked = true;
                markedIndex = index;
            }
        });
        
        if (!foundMarked) return;
        
        // Hide the marked word and everything after it
        wordElements.forEach((el, index) => {
            if (index >= markedIndex) {
                el.classList.add('hidden');
            }
        });
        
        // Store the hidden index
        this.hiddenFromIndex = markedIndex;
        this.textIsHidden = true;
        
        // Show continue button
        this.continueBtn.style.display = 'block';
    }
    
    unmarkWord(word, element) {
        if (!this.markedWords.has(word)) return;
        
        const count = this.markedWords.get(word);
        if (count > 1) {
            this.markedWords.set(word, count - 1);
        } else {
            this.markedWords.delete(word);
        }
        
        // Update UI
        element.classList.remove('marked');
    }
    
    toggleMarkingMode(isActive) {
        this.markingMode = isActive;
        
        // Sync both toggles
        this.markingModeToggle.checked = isActive;
        this.markingModeToggleFloat.checked = isActive;
        
        // Update labels and classes
        if (isActive) {
            this.readingContent.classList.add('marking-mode');
            this.modeLabel.textContent = 'Marking Mode: ON';
            this.modeLabel.classList.add('active');
            this.modeLabelFloat.textContent = 'Marking Mode';
            this.modeLabelFloat.classList.add('active');
        } else {
            this.readingContent.classList.remove('marking-mode');
            this.modeLabel.textContent = 'Marking Mode: OFF';
            this.modeLabel.classList.remove('active');
            this.modeLabelFloat.textContent = 'Marking Mode';
            this.modeLabelFloat.classList.remove('active');
        }
    }
    
    updateMarkedCount() {
        const markedElements = this.readingContent.querySelectorAll('.word.marked');
        const count = markedElements.length;
        
        if (this.markedCount) {
            this.markedCount.textContent = count;
        }
    }
    
    removeMarkedWords() {
        if (this.markedWords.size === 0) {
            alert('No words marked to remove!');
            return;
        }
        
        if (!confirm('Remove marked words from the document? This will simplify the text.')) {
            return;
        }
        
        // Get all marked instances with context before removal
        const instances = this.getMarkedInstances();
        
        // Add to removed words list
        this.removedWords.push(...instances);
        
        // Get all word elements
        const wordElements = document.querySelectorAll('.word');
        const indicesToRemove = new Set();
        
        // Mark indices for removal based on marked class
        wordElements.forEach((element, index) => {
            if (element.classList.contains('marked')) {
                const wordIndex = parseInt(element.dataset.index);
                if (!isNaN(wordIndex)) {
                    indicesToRemove.add(wordIndex);
                }
            }
        });
        
        // Rebuild words array without marked words
        const newWords = [];
        this.words.forEach((word, index) => {
            if (!indicesToRemove.has(index)) {
                newWords.push(word);
            }
        });
        this.words = newWords;
        
        // Clear marked words map
        this.markedWords.clear();
        
        // Rebuild the original text and re-render
        this.originalText = this.words.join('');
        this.renderText();
        
        // Update counts
        this.updateMarkedCount();
        this.updateRemovedCount();
        
        // Show feedback
        alert(`${indicesToRemove.size} word(s) removed from the document!`);
    }
    
    clearAllMarks() {
        const markedElements = this.readingContent.querySelectorAll('.word.marked');
        
        if (markedElements.length === 0) {
            alert('No words are marked!');
            return;
        }
        
        // Remove all marks
        markedElements.forEach(el => el.classList.remove('marked'));
        
        // Show all hidden text
        document.querySelectorAll('.word.hidden').forEach(el => {
            el.classList.remove('hidden');
        });
        
        // Hide continue button
        this.continueBtn.style.display = 'none';
        
        // Reset state
        this.textIsHidden = false;
        this.hiddenFromIndex = -1;
        
        // Clear marked words map
        this.markedWords.clear();
        
        // Update count
        this.updateMarkedCount();
    }
    
    updateRemovedCount() {
        if (this.removedCount) {
            this.removedCount.textContent = this.removedWords.length;
        }
    }
    
    newDocument() {
        if (confirm('Start with a new document? This will clear your current session.')) {
            // Reset state
            this.markedWords.clear();
            this.removedWords = [];
            this.markingMode = false;
            this.words = [];
            this.originalText = '';
            this.textInput.value = '';
            
            // Reset UI
            document.querySelector('.input-section').style.display = 'block';
            this.readingSection.style.display = 'none';
            this.floatingControls.style.display = 'none';
            this.hideSummary();
            
            // Reset PDF
            this.loadedPdf = null;
            this.pdfFileName = '';
            this.pageSelectionPanel.style.display = 'none';
            this.uploadStatus.textContent = '';
            this.pdfUpload.value = '';
        }
    }
    
    showSummary() {
        if (this.removedWords.length === 0) {
            alert('No words have been removed yet!');
            return;
        }
        
        // Group instances by marked text
        const instancesByWord = new Map();
        this.removedWords.forEach(instance => {
            const key = instance.markedText;
            if (!instancesByWord.has(key)) {
                instancesByWord.set(key, []);
            }
            instancesByWord.get(key).push(instance);
        });
        
        // Update stats
        this.totalMarked.textContent = this.removedWords.length;
        this.uniqueMarked.textContent = instancesByWord.size;
        
        // Create list items sorted by count
        const sortedGroups = Array.from(instancesByWord.entries())
            .sort((a, b) => b[1].length - a[1].length);
        
        this.summaryList.innerHTML = '';
        
        sortedGroups.forEach(([markedText, instances]) => {
            const div = document.createElement('div');
            div.className = 'word-item';
            
            const firstInstance = instances[0];
            const before = firstInstance.before || '...';
            const after = firstInstance.after || '...';
            
            div.innerHTML = `
                <div class="word-item-context">
                    <span class="context-word">${this.escapeHtml(before)}</span>
                    <span class="marked-word">${this.escapeHtml(markedText)}</span>
                    <span class="context-word">${this.escapeHtml(after)}</span>
                </div>
                <span class="word-item-count">${instances.length}x</span>
            `;
            
            this.summaryList.appendChild(div);
        });
        
        // Show panel and overlay
        this.summaryPanel.style.display = 'block';
        this.overlay.classList.add('active');
    }
    
    hideSummary() {
        this.summaryPanel.style.display = 'none';
        this.overlay.classList.remove('active');
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    continueReading() {
        // Show all hidden words
        document.querySelectorAll('.word.hidden').forEach(el => {
            el.classList.remove('hidden');
        });
        
        // Hide continue button
        this.continueBtn.style.display = 'none';
        
        // Reset state
        this.textIsHidden = false;
        this.hiddenFromIndex = -1;
    }
    
    getMarkedInstances() {
        const markedElements = this.readingContent.querySelectorAll('.word.marked');
        const wordElements = Array.from(this.readingContent.querySelectorAll('.word'));
        const instances = [];
        
        // Group consecutive marked words into blocks
        let i = 0;
        while (i < wordElements.length) {
            if (wordElements[i].classList.contains('marked')) {
                // Found start of a marked block
                const blockStart = i;
                let blockEnd = i;
                
                // Find end of consecutive marked words
                while (blockEnd + 1 < wordElements.length && 
                       wordElements[blockEnd + 1].classList.contains('marked')) {
                    blockEnd++;
                }
                
                // Get context
                const beforeElement = blockStart > 0 ? wordElements[blockStart - 1] : null;
                const afterElement = blockEnd + 1 < wordElements.length ? wordElements[blockEnd + 1] : null;
                
                // Build marked text (the block)
                let markedText = '';
                for (let j = blockStart; j <= blockEnd; j++) {
                    markedText += wordElements[j].textContent;
                    if (j < blockEnd) markedText += ' ';
                }
                
                instances.push({
                    markedText: markedText.trim(),
                    before: beforeElement ? beforeElement.textContent.trim() : null,
                    after: afterElement ? afterElement.textContent.trim() : null
                });
                
                // Skip to end of block
                i = blockEnd + 1;
            } else {
                i++;
            }
        }
        
        return instances;
    }
    
    exportList() {
        if (this.removedWords.length === 0) {
            alert('No words to export!');
            return;
        }
        
        // Group by marked text
        const instancesByWord = new Map();
        this.removedWords.forEach(instance => {
            const key = instance.markedText;
            if (!instancesByWord.has(key)) {
                instancesByWord.set(key, []);
            }
            instancesByWord.get(key).push(instance);
        });
        
        // Create CSV content
        let csvContent = 'Removed Word(s),Context Before,Context After,Count\n';
        
        const sortedGroups = Array.from(instancesByWord.entries())
            .sort((a, b) => b[1].length - a[1].length);
        
        sortedGroups.forEach(([markedText, instances]) => {
            const firstInstance = instances[0];
            const before = firstInstance.before || '';
            const after = firstInstance.after || '';
            csvContent += `"${markedText}","${before}","${after}",${instances.length}\n`;
        });
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'removed-words.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
    
    copyToClipboard() {
        if (this.removedWords.length === 0) {
            alert('No words to copy!');
            return;
        }
        
        // Group by marked text
        const instancesByWord = new Map();
        this.removedWords.forEach(instance => {
            const key = instance.markedText;
            if (!instancesByWord.has(key)) {
                instancesByWord.set(key, []);
            }
            instancesByWord.get(key).push(instance);
        });
        
        // Create text list
        const sortedGroups = Array.from(instancesByWord.entries())
            .sort((a, b) => b[1].length - a[1].length);
        
        let textContent = 'Removed Words:\n\n';
        sortedGroups.forEach(([markedText, instances]) => {
            const firstInstance = instances[0];
            const before = firstInstance.before || '';
            const after = firstInstance.after || '';
            const context = `${before} [${markedText}] ${after}`.trim();
            textContent += `${context} (${instances.length}x)\n`;
        });
        
        // Copy to clipboard
        navigator.clipboard.writeText(textContent).then(() => {
            // Show temporary feedback
            const originalText = this.copyBtn.textContent;
            this.copyBtn.textContent = '✓ Copied!';
            this.copyBtn.style.background = '#4caf50';
            
            setTimeout(() => {
                this.copyBtn.textContent = originalText;
                this.copyBtn.style.background = '';
            }, 2000);
        }).catch(err => {
            alert('Failed to copy to clipboard. Please try again.');
            console.error('Copy failed:', err);
        });
    }
    
    async openNotes(noteType) {
        if (!this.notesModal) {
            console.error('Notes modal not found in DOM');
            return;
        }
        
        // Store which note type we're editing (if not already set)
        if (!this.currentNoteType) {
            this.currentNoteType = noteType;
        }
        
        // Update modal title based on note type
        const modalTitle = this.notesModal.querySelector('h2');
        const titles = {
            car: '🚗 Car Notes',
            files: '📁 Files Notes',
            passwords: '🔐 Passwords Notes',
            chess: '♟️ Chess Notes',
            business: '💼 Business Notes',
            lotiontape: '🩹 Lotion Tape Notes',
            investing: '💰 Investing Notes',
            blender: '🎨 Blender Notes',
            organicchemistry: '🧪 Organic Chemistry Notes',
            math: '🔢 Math Notes',
            biology: '🧬 Biology Notes',
            '3dprinting': '🖨️ 3D Printing Notes',
            reader: '📝 Reader Notes'
        };
        if (modalTitle) {
            modalTitle.textContent = titles[noteType] || '📝 Notes';
        }
        
        // Only load file content if textarea is empty (first time opening in this session)
        if (!this.notesTextarea.value.trim()) {
            // If we have a file handle for this note type, load existing content
            if (this.notesFileHandles[noteType]) {
                try {
                    const file = await this.notesFileHandles[noteType].getFile();
                    const content = await file.text();
                    this.notesTextarea.value = content;
                } catch (error) {
                    console.error(`Error reading ${noteType} notes file:`, error);
                    // File might have been deleted, reset handle
                    this.notesFileHandles[noteType] = null;
                }
            }
        }
        // If textarea has content, keep it (don't reload from file)
        
        this.notesModal.style.display = 'flex';
        this.notesTextarea.focus();
    }
    
    closeNotes() {
        if (!this.notesModal) return;
        // Just hide the modal, don't clear the textarea
        // Notes will persist until saved or until switching to a different note type
        this.notesModal.style.display = 'none';
    }
    
    toggleNotesDropdown() {
        if (!this.notesDropdown) return;
        
        if (this.notesDropdown.style.display === 'none' || this.notesDropdown.style.display === '') {
            this.notesDropdown.style.display = 'block';
        } else {
            this.notesDropdown.style.display = 'none';
        }
    }
    
    hideNotesDropdown() {
        if (!this.notesDropdown) return;
        this.notesDropdown.style.display = 'none';
    }
    
    async saveNotes() {
        const newNotes = this.notesTextarea.value.trim();
        
        if (!newNotes) {
            alert('Please write some notes before saving!');
            return;
        }
        
        // Wrap text at 80 characters for readability
        const wrappedNotes = this.wrapText(newNotes, 80);
        
        if (this.fileSystemSupported) {
            // Use File System Access API
            await this.saveNotesWithFileSystemAPI(wrappedNotes);
        } else {
            // Fallback to download method
            await this.saveNotesWithDownload(wrappedNotes);
        }
    }
    
    async saveNotesWithFileSystemAPI(content) {
        try {
            const noteType = this.currentNoteType;
            if (!noteType) {
                console.error('No note type selected');
                return;
            }
            
            console.log(`Starting save process for ${noteType} notes...`);
            console.log('Current file handle:', this.notesFileHandles[noteType]);
            
            // File name mapping
            const fileNames = {
                car: 'car-notes.txt',
                files: 'files-notes.txt',
                passwords: 'passwords-notes.txt',
                chess: 'chess-notes.txt',
                business: 'business-notes.txt',
                lotiontape: 'lotion-tape-notes.txt',
                investing: 'investing-notes.txt',
                blender: 'blender-notes.txt',
                organicchemistry: 'organic-chemistry-notes.txt',
                math: 'math-notes.txt',
                biology: 'biology-notes.txt',
                '3dprinting': '3d-printing-notes.txt',
                reader: 'reading-notes.txt'
            };
            
            // If we don't have a file handle, ask user to select/create file
            if (!this.notesFileHandles[noteType]) {
                console.log('No file handle found, showing file picker...');
                this.notesFileHandles[noteType] = await window.showSaveFilePicker({
                    suggestedName: fileNames[noteType],
                    types: [{
                        description: 'Text Files',
                        accept: {
                            'text/plain': ['.txt']
                        }
                    }]
                });
                
                console.log('File handle obtained:', this.notesFileHandles[noteType]);
                
                // Save the file handle to IndexedDB for future use
                await this.saveFileHandle(this.notesFileHandles[noteType], noteType);
                console.log('File handle saved to IndexedDB');
            } else {
                console.log('Using existing file handle');
            }
            
            // Check if we have permission to write
            let permission = await this.notesFileHandles[noteType].queryPermission({ mode: 'readwrite' });
            console.log('Current permission:', permission);
            
            if (permission === 'denied') {
                console.log('Permission denied, requesting...');
                // Request permission
                const newPermission = await this.notesFileHandles[noteType].requestPermission({ mode: 'readwrite' });
                if (newPermission === 'denied') {
                    alert('Permission to write to file was denied. Your notes cannot be saved.');
                    return;
                }
                permission = newPermission;
            }
            
            // If permission was prompt, request it
            if (permission === 'prompt') {
                console.log('Permission prompt, requesting...');
                const newPermission = await this.notesFileHandles[noteType].requestPermission({ mode: 'readwrite' });
                if (newPermission === 'denied') {
                    alert('Permission to write to file was denied. Your notes cannot be saved.');
                    return;
                }
                permission = newPermission;
            }
            
            console.log('Final permission:', permission);
            
            // Get existing content
            let existingContent = '';
            try {
                const file = await this.notesFileHandles[noteType].getFile();
                existingContent = await file.text();
                console.log('Existing content length:', existingContent.length);
            } catch (error) {
                // File might not exist yet, that's okay
                console.log('No existing content, starting fresh');
            }
            
            // Append new notes to existing content
            let finalContent;
            if (existingContent.trim()) {
                // Just add separator without timestamp
                finalContent = existingContent + '\n\n' + content;
            } else {
                finalContent = content;
            }
            
            console.log('Final content length:', finalContent.length);
            
            // Write to file
            const writable = await this.notesFileHandles[noteType].createWritable();
            await writable.write(finalContent);
            await writable.close();
            
            console.log('File written successfully!');
            
            // Clear the textarea after successful save
            this.notesTextarea.value = '';
            
            // Close modal
            this.closeNotes();
            
            alert('Notes saved successfully to the same file!');
            
        } catch (error) {
            if (error.name === 'AbortError') {
                // User cancelled the file picker
                console.log('File selection cancelled');
            } else {
                console.error('Error saving notes:', error);
                alert('Error saving notes: ' + error.message);
            }
        }
    }
    
    async saveNotesWithDownload(content) {
        // Fallback method for browsers that don't support File System Access API
        const noteType = this.currentNoteType;
        if (!noteType) {
            console.error('No note type selected');
            return;
        }
        
        // File name mapping
        const fileNames = {
            car: 'car-notes.txt',
            files: 'files-notes.txt',
            passwords: 'passwords-notes.txt',
            chess: 'chess-notes.txt',
            business: 'business-notes.txt',
            lotiontape: 'lotion-tape-notes.txt',
            investing: 'investing-notes.txt',
            blender: 'blender-notes.txt',
            organicchemistry: 'organic-chemistry-notes.txt',
            math: 'math-notes.txt',
            biology: 'biology-notes.txt',
            '3dprinting': '3d-printing-notes.txt',
            reader: 'reading-notes.txt'
        };
        
        // Get existing notes from localStorage for this note type
        const storageKey = `${noteType}Notes`;
        let existingNotes = localStorage.getItem(storageKey) || '';
        
        // Append new notes without timestamp
        if (existingNotes) {
            existingNotes += '\n\n' + content;
        } else {
            existingNotes = content;
        }
        
        // Save back to localStorage
        localStorage.setItem(storageKey, existingNotes);
        
        // Download the complete notes file
        const blob = new Blob([existingNotes], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileNames[noteType];
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Clear the textarea after successful save
        this.notesTextarea.value = '';
        
        // Close modal
        this.closeNotes();
        
        alert('Notes saved and downloaded! (Using fallback method - a new file will be created each time)');
    }
    
    wrapText(text, maxLineLength) {
        const paragraphs = text.split('\n');
        const wrappedParagraphs = paragraphs.map(paragraph => {
            if (paragraph.trim().length === 0) {
                return '';
            }
            
            const words = paragraph.split(' ');
            const lines = [];
            let currentLine = '';
            
            words.forEach(word => {
                if ((currentLine + ' ' + word).length <= maxLineLength) {
                    currentLine += (currentLine ? ' ' : '') + word;
                } else {
                    if (currentLine) {
                        lines.push(currentLine);
                    }
                    currentLine = word;
                }
            });
            
            if (currentLine) {
                lines.push(currentLine);
            }
            
            return lines.join('\n');
        });
        
        return wrappedParagraphs.join('\n');
    }
}

// Initialize the reader when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FocusTrackerReader();
});
