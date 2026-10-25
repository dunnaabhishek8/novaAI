from __future__ import annotations

import os
import tempfile
import threading
import time
from collections import OrderedDict
from typing import Annotated, Any, Dict, Optional, TypedDict

from dotenv import load_dotenv
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.vectorstores import FAISS
from langchain_core.messages import BaseMessage, SystemMessage
from langchain_core.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_groq import ChatGroq
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_tavily import TavilySearch
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode, tools_condition
import requests
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

load_dotenv()

# -------------------
# 1. LLM + embeddings
# -------------------
llm = ChatGroq(
    model="openai/gpt-oss-20b",
    temperature=0.5,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)

embeddings = GoogleGenerativeAIEmbeddings(
    model="gemini-embedding-001",
    google_api_key=os.getenv("GOOGLE_API_KEY")
)

# -------------------
# 2. PDF index store (per thread)
# -------------------
# Postgres (table `rag_indexes`) is the source of truth, so indexes survive restarts,
# redeploys and the free-tier sleep/wake cycle (a container's disk is wiped on all of those).
# A small in-memory LRU cache keeps recently used indexes fast and caps RAM usage.
MAX_CACHED_INDEXES = int(os.getenv("MAX_CACHED_INDEXES", "15"))

_THREAD_RETRIEVERS: "OrderedDict[str, Any]" = OrderedDict()
_THREAD_METADATA: Dict[str, dict] = {}
_CACHE_LOCK = threading.Lock()


def _cache_put(thread_id: str, store: Any, metadata: dict) -> Any:
    retriever = store.as_retriever(search_type="similarity", search_kwargs={"k": 4})
    with _CACHE_LOCK:
        _THREAD_RETRIEVERS[thread_id] = retriever
        _THREAD_RETRIEVERS.move_to_end(thread_id)
        while len(_THREAD_RETRIEVERS) > MAX_CACHED_INDEXES:
            _THREAD_RETRIEVERS.popitem(last=False)  # evict least recently used; reloadable from DB
        _THREAD_METADATA[thread_id] = metadata
    return retriever


def _save_index(thread_id: str, metadata: dict, store: Any) -> None:
    # NOTE: FAISS serialisation uses pickle. We only ever load bytes that this service wrote
    # into our own database, which is the same trust boundary as the DB credentials.
    data = store.serialize_to_bytes()
    with pool.connection() as conn:
        conn.execute(
            """
            INSERT INTO rag_indexes (thread_id, filename, documents, chunks, data)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (thread_id) DO UPDATE SET
                filename = EXCLUDED.filename,
                documents = EXCLUDED.documents,
                chunks = EXCLUDED.chunks,
                data = EXCLUDED.data,
                created_at = now()
            """,
            (thread_id, metadata["filename"], metadata["documents"], metadata["chunks"], data),
        )


def _fetch_metadata(thread_id: str) -> Optional[dict]:
    """Cheap lookup (no vector data), used for status checks."""
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT filename, documents, chunks FROM rag_indexes WHERE thread_id = %s",
            (thread_id,),
        ).fetchone()
    if not row:
        return None
    metadata = {"filename": row["filename"], "documents": row["documents"], "chunks": row["chunks"]}
    _THREAD_METADATA[thread_id] = metadata
    return metadata


def _load_index(thread_id: str) -> Optional[Any]:
    with pool.connection() as conn:
        row = conn.execute(
            "SELECT filename, documents, chunks, data FROM rag_indexes WHERE thread_id = %s",
            (thread_id,),
        ).fetchone()
    if not row:
        return None
    store = FAISS.deserialize_from_bytes(
        serialized=bytes(row["data"]),
        embeddings=embeddings,
        allow_dangerous_deserialization=True,
    )
    metadata = {"filename": row["filename"], "documents": row["documents"], "chunks": row["chunks"]}
    return _cache_put(thread_id, store, metadata)


def _get_retriever(thread_id: Optional[str]):
    if not thread_id:
        return None
    thread_id = str(thread_id)
    with _CACHE_LOCK:
        cached = _THREAD_RETRIEVERS.get(thread_id)
        if cached is not None:
            _THREAD_RETRIEVERS.move_to_end(thread_id)
            return cached
    return _load_index(thread_id)


def ingest_pdf(file_bytes: bytes, thread_id: str, filename: Optional[str] = None) -> dict:
    if not file_bytes:
        raise ValueError("No bytes received for ingestion.")

    thread_id = str(thread_id)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
        temp_file.write(file_bytes)
        temp_path = temp_file.name

    try:
        loader = PyPDFLoader(temp_path)
        docs = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", " ", ""],
        )
        chunks = splitter.split_documents(docs)
        if not chunks:
            raise ValueError("No extractable text found in this PDF.")

        # Rate Limit Handling for Gemini Free Tier
        batch_size = 90
        vector_store = None

        for i in range(0, len(chunks), batch_size):
            batch = chunks[i : i + batch_size]

            if vector_store is None:
                vector_store = FAISS.from_documents(batch, embeddings)
            else:
                vector_store.add_documents(batch)

            if i + batch_size < len(chunks):
                time.sleep(2)

        metadata = {
            "filename": filename or os.path.basename(temp_path),
            "documents": len(docs),
            "chunks": len(chunks),
        }

        _save_index(thread_id, metadata, vector_store)   # durable first...
        _cache_put(thread_id, vector_store, metadata)    # ...then hot cache

        return dict(metadata)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass

# -------------------
# 3. Tools
# -------------------
# Tavily automatically uses the TAVILY_API_KEY from your environment
search_tool = TavilySearch(max_results=5)

@tool
def calculator(first_num: float, second_num: float, operation: str) -> dict:
    """Perform a basic arithmetic operation on two numbers."""
    try:
        if operation == "add": result = first_num + second_num
        elif operation == "sub": result = first_num - second_num
        elif operation == "mul": result = first_num * second_num
        elif operation == "div":
            if second_num == 0: return {"error": "Division by zero"}
            result = first_num / second_num
        else: return {"error": f"Unsupported operation '{operation}'"}

        return {"first_num": first_num, "second_num": second_num, "operation": operation, "result": result}
    except Exception as e:
        return {"error": str(e)}

@tool
def get_stock_price(symbol: str) -> dict:
    """Fetch latest stock price for a given symbol."""
    api_key = os.getenv("ALPHAVANTAGE_API_KEY", "").strip()
    if not api_key: return {"error": "ALPHAVANTAGE_API_KEY not configured."}

    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={api_key}"
    try:
        r = requests.get(url, timeout=15)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}

@tool
def rag_tool(query: str, config: RunnableConfig) -> dict:
    """Retrieve relevant information from the uploaded PDF for this chat thread."""
    thread_id = config.get("configurable", {}).get("thread_id")
    retriever = _get_retriever(thread_id)
    
    if retriever is None:
        return {"error": "No document indexed for this chat. Upload a PDF first.", "query": query}

    result = retriever.invoke(query)
    return {
        "query": query,
        "context": [doc.page_content for doc in result],
        "metadata": [doc.metadata for doc in result],
        "source_file": _THREAD_METADATA.get(str(thread_id), {}).get("filename"),
    }

tools = [search_tool, get_stock_price, calculator, rag_tool]
llm_with_tools = llm.bind_tools(tools)

# -------------------
# 4. State
# -------------------
class ChatState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]

# -------------------
# 5. Nodes
# -------------------
def chat_node(state: ChatState, config=None):
    system_message = SystemMessage(
        content=(
            "You are a helpful assistant. "
            "CRITICAL INSTRUCTION: If the user asks ANY question about a document, resume, PDF, or file, "
            "you MUST call the `rag_tool`. Do not say you don't see the PDF; just use the tool. "
            "If the tool returns an error saying no document is indexed, THEN you can ask the user to upload a PDF. "
            "You can also use the web search, stock price, and calculator tools when helpful."
        )
    )
    messages = [system_message, *state["messages"]]
    response = llm_with_tools.invoke(messages, config=config)
    return {"messages": [response]}

tool_node = ToolNode(tools)

# -------------------
# 6. Database & Graph Compilation
# -------------------
DB_URI = os.getenv("SUPABASE_DB_URI")
if not DB_URI:
    raise ValueError("SUPABASE_DB_URI environment variable is not set.")

# A pool (not one long-lived connection): dead connections (idle timeouts on Supabase's
# pooler, network blips, DB restarts) are detected and replaced instead of breaking every request.
# prepare_threshold=0 keeps this compatible with Supabase's pooled connection strings.
pool = ConnectionPool(
    conninfo=DB_URI,
    min_size=1,
    max_size=int(os.getenv("DB_POOL_MAX", "5")),
    kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
    check=ConnectionPool.check_connection,
    open=False,
)
pool.open(wait=True, timeout=30)  # fail fast, with a clear error, if the database is unreachable

checkpointer = PostgresSaver(pool)
checkpointer.setup()

with pool.connection() as _conn:
    _conn.execute(
        """
        CREATE TABLE IF NOT EXISTS rag_indexes (
            thread_id  TEXT PRIMARY KEY,
            filename   TEXT NOT NULL,
            documents  INTEGER NOT NULL,
            chunks     INTEGER NOT NULL,
            data       BYTEA NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

graph = StateGraph(ChatState)
graph.add_node("chat_node", chat_node)
graph.add_node("tools", tool_node)

graph.add_edge(START, "chat_node")
graph.add_conditional_edges("chat_node", tools_condition)
graph.add_edge("tools", "chat_node")

chatbot = graph.compile(checkpointer=checkpointer)

# -------------------
# 7. Helpers
# -------------------
def retrieve_all_threads() -> list[str]:
    all_threads: set[str] = set()
    for checkpoint in checkpointer.list(None):
        tid = checkpoint.config["configurable"]["thread_id"]
        if tid is not None:
            all_threads.add(str(tid))
    return list(all_threads)

def thread_has_document(thread_id: str) -> bool:
    return _get_retriever(thread_id) is not None

def thread_document_metadata(thread_id: str) -> dict:
    thread_id = str(thread_id)
    metadata = _THREAD_METADATA.get(thread_id) or _fetch_metadata(thread_id)
    return metadata or {}

def delete_thread_data(thread_id: str) -> None:
    """Remove everything stored for a conversation: the PDF index and the agent's memory."""
    thread_id = str(thread_id)
    with _CACHE_LOCK:
        _THREAD_RETRIEVERS.pop(thread_id, None)
        _THREAD_METADATA.pop(thread_id, None)
    with pool.connection() as conn:
        conn.execute("DELETE FROM rag_indexes WHERE thread_id = %s", (thread_id,))
    checkpointer.delete_thread(thread_id)
