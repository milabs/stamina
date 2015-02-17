MODNAME		?= test

obj-m		+= $(MODNAME).o
$(MODNAME)-objs	+= stam.o

ccflags-y	+= -std=gnu99 -fno-stack-protector -fomit-frame-pointer
ccflags-y	+= -Wno-declaration-after-statement

ifdef CONFIG_RETPOLINE
ccflags-y	+= $(call cc-option,-fcf-protection=none)
endif

KBUILD_CFLAGS	:= $(filter-out -pg,$(KBUILD_CFLAGS))
KBUILD_CFLAGS	:= $(filter-out -mfentry,$(KBUILD_CFLAGS))
