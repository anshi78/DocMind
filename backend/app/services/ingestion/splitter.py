import tiktoken


class TokenSplitter:
    def __init__(
        self,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        encoding_name: str = "cl100k_base",
    ):
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.encoding = tiktoken.get_encoding(encoding_name)
        self.separators = ["\n\n", "\n", " ", ""]

    def count_tokens(self, text: str) -> int:
        """Count the number of tokens in the text."""
        return len(self.encoding.encode(text))

    def split_text(self, text: str) -> list[str]:
        """
        Recursively split the text into chunks of at most chunk_size tokens
        with chunk_overlap tokens overlap.
        """
        if self.count_tokens(text) <= self.chunk_size:
            return [text] if text.strip() else []

        return self._split(text, self.separators)

    def _split(self, text: str, separators: list[str]) -> list[str]:
        """Internal recursive splitting function."""
        # Find the first separator that splits the text
        separator = separators[-1]
        remaining_separators = []
        
        for i, sep in enumerate(separators):
            if sep == "":
                separator = sep
                remaining_separators = separators[i + 1 :]
                break
            if sep in text:
                separator = sep
                remaining_separators = separators[i + 1 :]
                break

        # Split text by the separator
        if separator != "":
            splits = text.split(separator)
        else:
            splits = list(text)

        # Merge splits into chunks adhering to chunk_size and chunk_overlap
        chunks = []
        current_doc = []
        current_tokens = 0

        for split in splits:
            # Re-add separator if it's not empty, except for the last element
            # (or we can just join by separator later)
            split_tokens = self.count_tokens(split)

            # If a single split is larger than the chunk size, we must recursively split it
            if split_tokens > self.chunk_size:
                # Merge whatever is in current_doc first
                if current_doc:
                    chunks.append(separator.join(current_doc))
                    current_doc = []
                    current_tokens = 0

                # Recursively split the oversized split
                sub_chunks = self._split(split, remaining_separators)
                chunks.extend(sub_chunks)
                continue

            # If adding this split exceeds chunk_size, we write out the current chunk
            if current_tokens + split_tokens > self.chunk_size:
                chunks.append(separator.join(current_doc))
                
                # Setup overlap for next chunk.
                # Backtrack elements from current_doc to form the overlap
                overlap_doc = []
                overlap_tokens = 0
                for item in reversed(current_doc):
                    item_tokens = self.count_tokens(item)
                    if overlap_tokens + item_tokens > self.chunk_overlap:
                        break
                    overlap_doc.insert(0, item)
                    overlap_tokens += item_tokens

                current_doc = overlap_doc
                current_tokens = overlap_tokens

            current_doc.append(split)
            current_tokens += split_tokens

        if current_doc:
            chunks.append(separator.join(current_doc))

        return [c.strip() for c in chunks if c.strip()]
