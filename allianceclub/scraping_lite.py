"""Scraping minimo, best-effort, solo para sacar un detalle concreto de producto
para el gancho del mensaje. Subconjunto reducido del patron de scoutclub/scraping.py,
copiado en vez de importado para no acoplar los dos proyectos via sys.path."""
from __future__ import annotations

import json
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {"User-Agent": USER_AGENT}
TIMEOUT = (5, 10)

GENERIC_TITLE_WORDS = {"home", "shop", "shop all", "store", "official store", "products", "new arrivals"}


def to_base_url(website: str) -> str:
    website = (website or "").strip()
    if not website:
        return ""
    if "://" not in website:
        website = "http://" + website
    parsed = urlparse(website)
    if not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def fetch(url: str) -> requests.Response | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        if resp.status_code == 200:
            return resp
    except requests.RequestException:
        return None
    return None


def get_soup(url: str) -> BeautifulSoup | None:
    resp = fetch(url)
    if resp is None:
        return None
    try:
        return BeautifulSoup(resp.text, "lxml")
    except Exception:
        return None


def get_product_urls(base_url: str, limit: int = 5) -> list[str]:
    resp = fetch(urljoin(base_url, "/products.json"))
    if resp is not None:
        try:
            data = resp.json()
            handles = [p.get("handle") for p in data.get("products", []) if p.get("handle")]
            if handles:
                return [urljoin(base_url, f"/products/{h}") for h in handles[:limit]]
        except (ValueError, json.JSONDecodeError):
            pass

    soup = get_soup(base_url)
    if soup is None:
        return []
    links: list[str] = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/products/" in href or "/product/" in href:
            full = urljoin(base_url, href)
            if full not in links:
                links.append(full)
        if len(links) >= limit:
            break
    return links


def extract_product_title(url: str) -> str | None:
    soup = get_soup(url)
    if soup is None:
        return None

    og = soup.find("meta", attrs={"property": "og:title"})
    if og and og.get("content"):
        title = og["content"].strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()
    else:
        return None

    for sep in (" | ", " - ", " – "):
        if sep in title:
            title = title.split(sep)[0].strip()

    if not title or title.lower() in GENERIC_TITLE_WORDS or len(title) > 70:
        return None
    return title


def find_flagship_product_title(website: str) -> str | None:
    """Best-effort: intenta sacar el nombre de un producto real del sitio. Nunca
    lanza excepcion, nunca inventa un nombre; si no encuentra nada devuelve None."""
    base_url = to_base_url(website)
    if not base_url:
        return None
    try:
        urls = get_product_urls(base_url, limit=3)
        for url in urls:
            title = extract_product_title(url)
            if title:
                return title
    except Exception:
        return None
    return None
