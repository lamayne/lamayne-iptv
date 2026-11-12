package com.lamayne.iptv.tv.data

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

// Categories on one side, the items of the selected category on the other: the
// same behaviour for live channels, movies and series.
class BrowseController<T : Any>(
    private val scope: CoroutineScope,
    private val fetchCategories: suspend (Credentials) -> List<Category>,
    private val fetchItems: suspend (Credentials, String) -> List<T>,
    private val hidden: () -> Set<String>,
) {
    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _selected = MutableStateFlow<Category?>(null)
    val selected: StateFlow<Category?> = _selected.asStateFlow()

    private val _items = MutableStateFlow<List<T>>(emptyList())
    val items: StateFlow<List<T>> = _items.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _error = MutableStateFlow<UiError?>(null)
    val error: StateFlow<UiError?> = _error.asStateFlow()

    private var job: Job? = null

    var started = false
        private set

    fun start(credentials: Credentials) {
        started = true
        job?.cancel()
        job = scope.launch {
            _loading.value = true
            _error.value = null

            try {
                val list = fetchCategories(credentials)

                _categories.value = list

                val first = list.firstOrNull { it.id !in hidden() } ?: list.firstOrNull()

                if (first != null) load(credentials, first)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = toUiError(e)
            } finally {
                _loading.value = false
            }
        }
    }

    fun select(credentials: Credentials, category: Category) {
        job?.cancel()
        job = scope.launch {
            _loading.value = true
            _error.value = null

            try {
                load(credentials, category)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                _error.value = toUiError(e)
            } finally {
                _loading.value = false
            }
        }
    }

    fun retry(credentials: Credentials) {
        val category = _selected.value

        if (category == null) start(credentials) else select(credentials, category)
    }

    fun reset() {
        job?.cancel()
        started = false
        _categories.value = emptyList()
        _selected.value = null
        _items.value = emptyList()
        _loading.value = false
        _error.value = null
    }

    private suspend fun load(credentials: Credentials, category: Category) {
        _selected.value = category
        _items.value = emptyList()
        _items.value = fetchItems(credentials, category.id)
    }
}
