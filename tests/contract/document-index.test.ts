import { runDocumentIndexContractTests } from './document-index.contract.js';
import { InMemoryDocumentIndex } from './in-memory-document-index.js';

runDocumentIndexContractTests((embedder) => new InMemoryDocumentIndex(embedder));
