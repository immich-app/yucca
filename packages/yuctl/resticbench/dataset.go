package resticbench

import (
	"bufio"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
)

// Manifest records how the dataset was produced so mutation rounds are
// deterministic and resumed runs know what is on disk.
type Manifest struct {
	Seed     uint64 `json:"seed"`
	Size     int64  `json:"size"`
	FileSize int64  `json:"fileSize"`
	Files    int    `json:"files"`
	Rounds   int    `json:"rounds"`
}

const manifestName = "manifest.json"

// fileKey derives the ChaCha8 key for one file's content in one round. Random
// (incompressible, dedup-proof) yet fully reproducible from (seed, index,
// round).
func fileKey(seed uint64, index, round int) [32]byte {
	var b [24]byte
	binary.LittleEndian.PutUint64(b[0:], seed)
	binary.LittleEndian.PutUint64(b[8:], uint64(index))
	binary.LittleEndian.PutUint64(b[16:], uint64(round))
	return sha256.Sum256(b[:])
}

func filePath(dir string, index int) string {
	return filepath.Join(dir, fmt.Sprintf("%03x", index>>8), fmt.Sprintf("f%08d", index))
}

func (m *Manifest) fileSizeAt(index int) int64 {
	if index == m.Files-1 {
		if rem := m.Size % m.FileSize; rem != 0 {
			return rem
		}
	}
	return m.FileSize
}

func writeFile(path string, key [32]byte, size int64) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	w := bufio.NewWriterSize(f, 1<<20)
	src := rand.NewChaCha8(key)
	buf := make([]byte, 1<<20)
	for size > 0 {
		n := int64(len(buf))
		if size < n {
			n = size
		}
		_, _ = src.Read(buf[:n])
		if _, err := w.Write(buf[:n]); err != nil {
			f.Close()
			return err
		}
		size -= n
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// Generate (re)creates the dataset under dir. progress receives byte deltas.
func Generate(dir string, size, fileSize int64, seed uint64, progress func(delta int64)) (*Manifest, error) {
	if fileSize <= 0 || size <= 0 || fileSize > size {
		return nil, fmt.Errorf("invalid size=%d fileSize=%d", size, fileSize)
	}
	if err := os.RemoveAll(dir); err != nil {
		return nil, err
	}
	m := &Manifest{
		Seed:     seed,
		Size:     size,
		FileSize: fileSize,
		Files:    int((size + fileSize - 1) / fileSize),
	}

	workers := runtime.NumCPU()
	if workers > 16 {
		workers = 16
	}
	indices := make(chan int)
	var wg sync.WaitGroup
	var firstErr atomic.Value
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range indices {
				sz := m.fileSizeAt(i)
				if err := writeFile(filePath(dir, i), fileKey(seed, i, 0), sz); err != nil {
					firstErr.CompareAndSwap(nil, err)
					return
				}
				if progress != nil {
					progress(sz)
				}
			}
		}()
	}
	for i := 0; i < m.Files; i++ {
		if firstErr.Load() != nil {
			break
		}
		indices <- i
	}
	close(indices)
	wg.Wait()
	if err := firstErr.Load(); err != nil {
		return nil, err.(error)
	}
	if err := saveManifest(dir, m); err != nil {
		return nil, err
	}
	return m, nil
}

// Mutate rewrites ~percent% of files with fresh random content (a full-file
// change, so restic re-uploads them) and bumps the manifest round.
func Mutate(dir string, m *Manifest, percent float64, progress func(delta int64)) (int64, error) {
	round := m.Rounds + 1
	k := int(float64(m.Files) * percent / 100)
	if k < 1 {
		k = 1
	}
	if k > m.Files {
		k = m.Files
	}

	// Partial Fisher-Yates over the virtual index range, seeded per round.
	rng := rand.New(rand.NewPCG(m.Seed, uint64(round)))
	swapped := map[int]int{}
	pick := func(i int) int {
		j := i + rng.IntN(m.Files-i)
		vi, ok := swapped[i]
		if !ok {
			vi = i
		}
		vj, ok := swapped[j]
		if !ok {
			vj = j
		}
		swapped[i], swapped[j] = vj, vi
		return vj
	}

	var written int64
	for i := 0; i < k; i++ {
		idx := pick(i)
		sz := m.fileSizeAt(idx)
		if err := writeFile(filePath(dir, idx), fileKey(m.Seed, idx, round), sz); err != nil {
			return written, err
		}
		written += sz
		if progress != nil {
			progress(sz)
		}
	}
	m.Rounds = round
	return written, saveManifest(dir, m)
}

func saveManifest(dir string, m *Manifest) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, manifestName), b, 0o644)
}
