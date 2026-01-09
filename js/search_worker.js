/* js/search_worker.js */

import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/dist/es/index.js';

let searchEngine = new MiniSearch({
    fields: ['title', 'description', 'keywords', 'category', 'municipality', 'mayor', 'name'],
    storeFields: ['id', 'title', 'description', 'category', 'okres', 'municipality', 'name', 'stat', 'starosta', 'adresa', 'em_o', 'em_s', 'mob_s', 'tc_o', 'tc_s', 'tc_d', 'type'],
    searchOptions: {
        boost: { title: 3, municipality: 3, mayor: 2, name: 2, keywords: 2 },
        fuzzy: 0.2,
        prefix: true
    }
});

self.onmessage = async function(e) {
    const { type, payload } = e.data;
    
    switch (type) {
        case 'INDEX_DATA':
            // OPRAVA: Vyčistenie indexu pred pridaním nových dát
            if (Array.isArray(payload)) {
                searchEngine.removeAll();  // Vymaže všetky existujúce záznamy
                searchEngine.addAll(payload);
            }
            self.postMessage({ type: 'INDEX_READY' });
            break;
            
        case 'SEARCH':
            const options = { ...payload.options };
            if (options.filterType) {
                const fType = options.filterType;
                options.filter = (result) => result.type === fType;
                delete options.filterType;
            }
            const results = searchEngine.search(payload.query, options);
            self.postMessage({ type: 'SEARCH_RESULTS', results, requestId: payload.requestId });
            break;
            
        case 'CLEAR_INDEX':
            searchEngine.removeAll();
            break;
    }
};
