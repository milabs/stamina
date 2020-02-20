#include <linux/kernel.h>
#include <linux/printk.h>
#include <linux/string.h>
#include <linux/module.h>
#include <linux/kallsyms.h>
#include <linux/slab.h>
#include <linux/stop_machine.h>
#include <linux/uaccess.h>
#include <linux/miscdevice.h>
#include <linux/version.h>

#include <asm/syscall.h> // NR_syscalls

static long lookup_name(const char *name) {
	long args[2] = { (long)name, 0 };
	int callback(void *p, const char *s, struct module *m, unsigned long a) {
		long *args = (void *)p;
		if (strcmp((char *)args[0], s)) return 0;
		else return args[1] = a;
	} kallsyms_on_each_symbol(callback, args);
	return args[1];
}

#define kernel_write_enter() asm volatile (	\
	"cli\n\t"				\
	"mov %%cr0, %%rax\n\t"			\
	"and $0xfffffffffffeffff, %%rax\n\t"	\
	"mov %%rax, %%cr0\n\t"			\
	::: "%rax" )

#define kernel_write_leave() asm volatile (	\
	"mov %%cr0, %%rax\n\t"			\
	"or $0x0000000000010000, %%rax\n\t"	\
	"mov %%rax, %%cr0\n\t"			\
	"sti\n\t"				\
	::: "%rax" )

// place a CALL(0xE8) or JUMP(0xE9) at addr @a from addr @f to addr @t
static inline void x86_put_br(char opcode, void *a, void *f, void *t) {
	*((char *)(a + 0)) = opcode;
	*(( int *)(a + 1)) = (long)(t - (f + 5));
}

////////////////////////////////////////////////////////////////////////////////

static void *stub = NULL;
static long pdo_syscall_64 = 0;
static long pcall_do_syscall_64 = 0;

static struct {
	long hit, min, max;
} usage[ NR_syscalls ] = { 0 };

static void __do_syscall_64_pre(unsigned long nr, struct pt_regs *regs) {
	long *p, *end= end_of_stack(current);
	if (nr >= NR_syscalls)
		return;
	p = (void *)(((long)&p - 64) & ~15UL);
	while (p > end) {
		*p-- = STACK_END_MAGIC;
	}
}

static void __do_syscall_64_post(unsigned long nr, struct pt_regs *regs) {
	long *end = end_of_stack(current), *p = end;

	if (nr >= NR_syscalls)
		return;
	while (*p == STACK_END_MAGIC) {
		p++;
	}

	// FIXME: use per-cpu tables or perfoem an atomic update
	long depth = THREAD_SIZE - (sizeof(long) * (p - end));
	if (usage[nr].min) usage[nr].min = min(usage[nr].min, depth);
	else usage[nr].min = depth;
	if (usage[nr].max) usage[nr].max = max(usage[nr].max, depth);
	else usage[nr].max = depth;
	usage[nr].hit++;
}

#if LINUX_VERSION_CODE > KERNEL_VERSION(4, 17, 0)
static void do_syscall_64_post(unsigned long nr, struct pt_regs *regs) {
	__do_syscall_64_pre(nr, regs);
}
static void do_syscall_64_pre(unsigned long nr, struct pt_regs *regs) {
	__do_syscall_64_post(nr, regs);
}
#else
static void do_syscall_64_post(struct pt_regs *regs) {
	__do_syscall_64_pre(regs->orig_ax & __SYSCALL_MASK, regs);
}
static void do_syscall_64_pre(struct pt_regs *regs) {
	__do_syscall_64_post(regs->orig_ax & __SYSCALL_MASK, regs);
}
#endif

//
// mov %rdi, %r12
// mov %rsi, %r13
//
#define P_SAVE_ARGS(p) do {	\
	*(char *)(p)++ = 0x49;	\
	*(char *)(p)++ = 0x89;	\
	*(char *)(p)++ = 0xfc;	\
	*(char *)(p)++ = 0x49;	\
	*(char *)(p)++ = 0x89;	\
	*(char *)(p)++ = 0xf5;	\
} while (0)

//
// mov %r12, %rdi
// mov %r13, %rsi
//
#define P_RESTORE_ARGS(p) do {	\
	*(char *)(p)++ = 0x4c;	\
	*(char *)(p)++ = 0x89;	\
	*(char *)(p)++ = 0xe7;	\
	*(char *)(p)++ = 0x4c;	\
	*(char *)(p)++ = 0x89;	\
	*(char *)(p)++ = 0xee;	\
} while (0)

#define P_CALL(p, to) do {		\
	P_RESTORE_ARGS(p);		\
	x86_put_br(0xE8,		\
		   (void *)(p),		\
		   (void *)(p),		\
		   (void *)(to));	\
	(p) += 5;			\
} while (0)

#define P_JUMP(p, to) do {		\
	P_RESTORE_ARGS(p);		\
	x86_put_br(0xE9,		\
		   (void *)(p),		\
		   (void *)(p),		\
		   (void *)(to));	\
	(p) += 5;			\
} while (0)

static char *build_stub(void) {
	char *p, *stub = NULL;
	void *(*alloc)(size_t) = (void *)lookup_name("module_alloc");
	if (!alloc || ((p = stub = alloc(PAGE_SIZE)) == NULL)) {
		pr_err("Stub allocation failed\n");
		return NULL;
	}

	P_SAVE_ARGS(p); // 6 bytes
	P_CALL(p, do_syscall_64_pre); // 11 bytes
	P_CALL(p, pdo_syscall_64); // 11 bytes
	P_CALL(p, do_syscall_64_post); // 11 bytes
	P_JUMP(p, pcall_do_syscall_64 + 5);

	int (*set_memory_x)(unsigned long, int) = (void *)lookup_name("set_memory_x");
	if (set_memory_x) set_memory_x((unsigned long)stub, 1);

	return stub;
}

////////////////////////////////////////////////////////////////////////////////

static int do_sm_init(void *arg) {
	kernel_write_enter();
	x86_put_br(0xE9, // jump
		   (void *)pcall_do_syscall_64,
		   (void *)pcall_do_syscall_64, stub);
	kernel_write_leave();
	return 0;
}

static int do_sm_cleanup(void *arg) {
	kernel_write_enter();
	memset(stub, 0x90, 15 + 24);
	x86_put_br(0xE8, // call
		   (void *)pcall_do_syscall_64,
		   (void *)pcall_do_syscall_64, (void *)pdo_syscall_64);
	kernel_write_leave();
	return 0;
}

////////////////////////////////////////////////////////////////////////////////

static int dev_open(struct inode *inode, struct file *file) {
	return 0;
}

static ssize_t dev_read(struct file *file, char __user *ptr, size_t len, loff_t *ppos) {
	if (*ppos > sizeof(usage))
		return -EINVAL;

	size_t nbytes = min_t(size_t, len, sizeof(usage) - *ppos);
	copy_to_user(ptr, (void *)usage + *ppos, nbytes);

	if (nbytes == 0) {
		memset(usage, 0, sizeof(usage));
	}

	return *ppos += nbytes, nbytes;
}

static struct miscdevice dev = {
	.name = "stam",
	.minor = MISC_DYNAMIC_MINOR,
	.fops = &(struct file_operations) {
		.owner = THIS_MODULE,
		.open = dev_open,
		.read = dev_read,
	}, .mode = 0444,
};

////////////////////////////////////////////////////////////////////////////////

int init_module(void) {
	long pentry_SYSCALL_64 = 0;

	pdo_syscall_64 = lookup_name("do_syscall_64");
	pentry_SYSCALL_64 = lookup_name("entry_SYSCALL_64");
	if (!pdo_syscall_64 || !pentry_SYSCALL_64) {
		pr_err("Can't find do_syscall_64 or entry_SYSCALL_64\n");
		return -EINVAL;
	}

	for (size_t i = 0; i < 512; i++) {
		long p = pentry_SYSCALL_64 + i;
		if (*(unsigned char *)p == 0xE8) {
			if ((p + *(int *)(p + 1) + 5) == pdo_syscall_64) {
				pcall_do_syscall_64 = p;
				break;
			}
		}
	}

	if (!pcall_do_syscall_64) {
		pr_err("Can't find call to do_syscall_64\n");
		return -EINVAL;
	}

	printk("THREAD_SIZE %lu\n", THREAD_SIZE);
	printk("do_syscall_64 found at %lx\n", pdo_syscall_64);
	printk("entry_SYSCALL_64 found at %lx\n", pentry_SYSCALL_64);
	printk("call to do_syscall_64 found at %lx\n", pcall_do_syscall_64);

	if ((stub = build_stub()) == NULL)
		return -EINVAL;

	misc_register(&dev);
	stop_machine(do_sm_init, NULL, NULL);

	return 0;
}

void cleanup_module(void) {
	stop_machine(do_sm_cleanup, NULL, NULL);
	misc_deregister(&dev);
}

MODULE_LICENSE("GPL\0but who really cares?");
