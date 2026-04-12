package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/install"
	"github.com/junior2wnw/4-2-rf/apps/agent/pkg/runtime"
)

var version = "0.1.0"

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	var err error
	switch os.Args[1] {
	case "version":
		fmt.Println(version)
	case "install":
		err = runInstall(os.Args[2:])
	case "run":
		err = runAgent(os.Args[2:])
	case "uninstall":
		err = runUninstall(os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}

	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func runInstall(args []string) error {
	fs := flag.NewFlagSet("install", flag.ContinueOnError)
	apiURL := fs.String("api-url", "", "API base URL")
	enrollmentToken := fs.String("enrollment-token", "", "Short-lived enrollment token")
	scope := fs.String("scope", "user", "Install scope: user or system")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if *apiURL == "" {
		return errors.New("--api-url is required")
	}

	options := install.Options{
		APIURL:          *apiURL,
		EnrollmentToken: *enrollmentToken,
		Scope:           *scope,
		Version:         version,
	}

	configPath, err := install.Install(options)
	if err != nil {
		return err
	}

	fmt.Printf("installed successfully\nconfig: %s\n", configPath)
	return nil
}

func runAgent(args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	configPath := fs.String("config", "", "Path to config file")
	if err := fs.Parse(args); err != nil {
		return err
	}

	if *configPath == "" {
		executable, err := os.Executable()
		if err != nil {
			return err
		}
		*configPath = filepath.Join(filepath.Dir(executable), "agent.json")
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	return runtime.Runner{Version: version}.Run(ctx, *configPath)
}

func runUninstall(args []string) error {
	fs := flag.NewFlagSet("uninstall", flag.ContinueOnError)
	scope := fs.String("scope", "user", "Install scope: user or system")
	if err := fs.Parse(args); err != nil {
		return err
	}

	return install.Uninstall(*scope)
}

func usage() {
	fmt.Println("4-2-agent commands: install | run | uninstall | version")
}
