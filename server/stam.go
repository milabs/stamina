package main

import (
	"log"
	"bufio"
	"net/http"
	"io/ioutil"
	"encoding/json"
	"encoding/binary"
	"strconv"
	"strings"
	"os/exec"
	"path"
	"os"
)

type Usage struct {
	Hit uint64 `json:"Hit"`
	Min uint64 `json:"Min"`
	Max uint64 `json:"Max"`
}

func serveStam(w http.ResponseWriter, r *http.Request) {

	raw, err := ioutil.ReadFile("/dev/stam"); if err != nil {
		http.Error(w, "Internal Server Error", 500)
		log.Println(err)
		return
	}

	count := len(raw) / 24 // FIXME
	usage := make([]Usage, count)

	for i := 0; i < count; i++ {
		p := &usage[i];
		p.Hit = binary.LittleEndian.Uint64(raw[(i * 24) + 0x00:])
		p.Min = binary.LittleEndian.Uint64(raw[(i * 24) + 0x08:])
		p.Max = binary.LittleEndian.Uint64(raw[(i * 24) + 0x10:])
	}

	a, err := json.Marshal(usage); if err != nil {
		http.Error(w, "Internal Server Error", 500)
		log.Println(err)
		return
	}

	w.Write(a)
}

var syscalls map[int]string

func fetchSyscalls() {
	v, err := exec.Command("uname", "-r").Output(); if err != nil {
		log.Fatal(err)
	}

	f, err := os.Open(path.Join("/lib/modules/", strings.TrimSpace(string(v)), "/build/arch/x86/include/generated/uapi/asm/unistd_64.h")); if err != nil {
		log.Fatal(err)
	}

	defer f.Close()

	scanner := bufio.NewScanner(f)
	syscalls = make(map[int]string)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "#define __NR") {
			items := strings.Split(line, " ")
			nr, _ := strconv.Atoi(items[2])
			syscalls[nr] = items[1]
		}
	}
}

func serveSyscalls(w http.ResponseWriter, r *http.Request) {
	a, err := json.Marshal(syscalls); if err != nil {
		http.Error(w, "Internal Server Error", 500)
		log.Println(err)
		return
	}

	w.Write(a)
}

func main() {
	fetchSyscalls()
	static := http.FileServer(http.Dir("static"))
	http.Handle("/", static)
	http.HandleFunc("/stam", serveStam)
	http.HandleFunc("/syscalls", serveSyscalls)
	http.ListenAndServe(":8080", nil)
}
